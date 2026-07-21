from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Any
import uuid
from datetime import datetime

from app.core.database import get_db
from app.models.models import Lot, ProductionStage, Design, Product, BarcodeScanHistory, Company, Factory
from app.schemas.schemas import LotCreate, LotResponse, PaginatedResponse, PaginationParams
from app.api.deps import get_current_active_user

router = APIRouter()

def _get_valid_company_and_factory(db: Session, current_user: Any):
    company_id = current_user.company_id
    if not company_id:
        c = db.query(Company).first()
        if not c:
            c = Company(name="Microtechnique MANUFACTURING", is_approved=True, subscription_plan="Enterprise Plan", tenant_status="active")
            db.add(c)
            db.commit()
            db.refresh(c)
        company_id = c.id

    factory_id = current_user.factory_id
    if not factory_id:
        f = db.query(Factory).filter(Factory.company_id == company_id).first()
        if not f:
            f = Factory(name="Main Production Unit", company_id=company_id, is_default=True)
            db.add(f)
            db.commit()
            db.refresh(f)
        factory_id = f.id

    return company_id, factory_id

def _resolve_design(db: Session, design_number_str: str, company_id: int):
    if not design_number_str:
        return None
    d_num = design_number_str.strip()
    
    # 1. Exact or case-insensitive match on design_number or name
    design = db.query(Design).filter(
        (Design.design_number.ilike(d_num)) |
        (Design.name.ilike(d_num)) |
        (Design.design_number.ilike(f"%{d_num}%")),
        (Design.company_id == company_id) | (Design.company_id == None)
    ).first()
    
    # 2. Fallback to any design matching design_number globally regardless of company_id
    if not design:
        design = db.query(Design).filter(
            (Design.design_number.ilike(d_num)) | (Design.name.ilike(d_num))
        ).first()

    # 3. Numeric ID fallback (e.g. user typed "3" or "D-3")
    if not design and d_num.replace("D-", "").replace("d-", "").isdigit():
        try:
            parsed_id = int(d_num.replace("D-", "").replace("d-", ""))
            design = db.query(Design).filter(Design.id == parsed_id).first()
        except ValueError:
            pass

    # 4. Auto-create Design on-the-fly if still not found
    if not design:
        target_company_id = company_id or 1
        prod = db.query(Product).filter(
            (Product.company_id == target_company_id) | (Product.company_id == None)
        ).first()
        if not prod:
            prod = Product(
                code=f"PRD-{uuid.uuid4().hex[:6].upper()}",
                name="Standard Garment",
                company_id=target_company_id
            )
            db.add(prod)
            db.commit()
            db.refresh(prod)
            
        design = Design(
            design_number=d_num,
            name=f"Design {d_num}",
            product_id=prod.id,
            company_id=target_company_id
        )
        db.add(design)
        db.commit()
        db.refresh(design)

    return design

@router.get("", response_model=PaginatedResponse[LotResponse])
def get_lots(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: Any = Depends(get_current_active_user)
) -> Any:
    """
    Retrieve lots.
    """
    company_id, _ = _get_valid_company_and_factory(db, current_user)
    total = db.query(Lot).filter(Lot.is_deleted == False, (Lot.company_id == company_id) | (Lot.company_id == None)).count()
    lots = db.query(Lot).filter(Lot.is_deleted == False, (Lot.company_id == company_id) | (Lot.company_id == None)).order_by(Lot.created_at.desc()).offset(skip).limit(limit).all()
    
    return {
        "items": lots,
        "total": total,
        "page": (skip // limit) + 1 if limit > 0 else 1,
        "page_size": limit,
        "total_pages": (total + limit - 1) // limit if limit > 0 else 1
    }

@router.post("", response_model=LotResponse)
def create_lot(
    *,
    db: Session = Depends(get_db),
    lot_in: LotCreate,
    current_user: Any = Depends(get_current_active_user)
) -> Any:
    """
    Create new lot.
    """
    company_id, factory_id = _get_valid_company_and_factory(db, current_user)

    # Auto-generate lot_number and barcode if not provided
    lot_number = lot_in.lot_number
    if not lot_number:
        today = datetime.now()
        prefix = f"LOT-{today.strftime('%Y%m%d')}"
        count = db.query(Lot).filter(Lot.lot_number.like(f"{prefix}%")).count()
        lot_number = f"{prefix}-{count + 1:04d}"
        
    barcode_string = lot_in.barcode
    if not barcode_string:
        # Create a clean, short scannable barcode based on global timestamp + count
        today = datetime.now()
        count = db.query(Lot).count()
        barcode_string = f"LOT-{today.strftime('%y%m%d%H%M')}-{count + 1:03d}"
        
    current_process = lot_in.current_process or ProductionStage.PLANNING.value
    
    design_id = lot_in.design_id
    product_id = lot_in.product_id
    
    if lot_in.design_number or not (design_id and product_id):
        lookup_str = lot_in.design_number or (f"D-{design_id}" if design_id else "D-001")
        design = _resolve_design(db, lookup_str, company_id)
        design_id = design.id
        product_id = design.product_id

    lot = Lot(
        design_id=design_id,
        product_id=product_id,
        color=lot_in.color,
        size=lot_in.size,
        quantity=lot_in.quantity,
        lot_number=lot_number,
        barcode=barcode_string,
        current_process=current_process,
        factory_id=factory_id,
        company_id=company_id,
        created_by=current_user.id
    )
    db.add(lot)
    db.commit()
    db.refresh(lot)
    return lot

@router.put("/{id}", response_model=LotResponse)
def update_lot(
    id: int,
    *,
    db: Session = Depends(get_db),
    lot_in: LotCreate,
    current_user: Any = Depends(get_current_active_user)
) -> Any:
    """
    Update a lot.
    """
    lot = db.query(Lot).filter(Lot.id == id, Lot.is_deleted == False, Lot.company_id == current_user.company_id).first()
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")
        
    design_id = lot_in.design_id
    product_id = lot_in.product_id
    if lot_in.design_number or not (design_id and product_id):
        lookup_str = lot_in.design_number or (f"D-{design_id}" if design_id else "D-001")
        design = _resolve_design(db, lookup_str, current_user.company_id)
        design_id = design.id
        product_id = design.product_id

    lot.design_id = design_id
    lot.product_id = product_id
    if lot_in.color is not None:
        lot.color = lot_in.color
    lot.size = lot_in.size
    lot.quantity = lot_in.quantity
    
    if lot_in.lot_number:
        lot.lot_number = lot_in.lot_number
    if lot_in.barcode:
        lot.barcode = lot_in.barcode
    if lot_in.current_process:
        lot.current_process = lot_in.current_process

    db.commit()
    db.refresh(lot)
    return lot

@router.get("/{id}", response_model=LotResponse)
def get_lot(
    id: int,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_active_user)
) -> Any:
    """
    Get lot by ID.
    """
    lot = db.query(Lot).filter(Lot.id == id, Lot.is_deleted == False, Lot.company_id == current_user.company_id).first()
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")
    return lot

@router.delete("/{id}")
def delete_lot(
    id: int,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_active_user)
) -> Any:
    """
    Delete a lot.
    """
    lot = db.query(Lot).filter(Lot.id == id, Lot.company_id == current_user.company_id).first()
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")
    
    lot.is_deleted = True
    db.commit()
    return {"success": True, "message": "Lot deleted successfully"}

@router.get("/{id}/activity")
def get_lot_activity(
    id: int,
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_current_active_user)
) -> Any:
    """
    Get scan history/activity of a lot.
    """
    lot = db.query(Lot).filter(Lot.id == id, Lot.is_deleted == False, Lot.company_id == current_user.company_id).first()
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")
        
    from app.models.models import User
    
    history = db.query(BarcodeScanHistory).filter(
        BarcodeScanHistory.barcode == lot.barcode,
        BarcodeScanHistory.is_deleted == False
    ).order_by(BarcodeScanHistory.created_at.desc()).all()
    
    results = []
    for h in history:
        user = db.query(User).filter(User.id == h.scanned_by).first()
        results.append({
            "id": h.id,
            "barcode": h.barcode,
            "scan_type": h.scan_type,
            "process_stage": h.process_stage,
            "remarks": h.remarks,
            "created_at": h.created_at,
            "scanned_by_name": user.full_name if user else "System"
        })
    return results
