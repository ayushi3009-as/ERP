from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Any
import uuid
from datetime import datetime

from app.core.database import get_db
from app.models.models import Lot, ProductionStage, Design, BarcodeScanHistory
from app.schemas.schemas import LotCreate, LotResponse, PaginatedResponse, PaginationParams
from app.api.deps import get_current_active_user

router = APIRouter()

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
    total = db.query(Lot).filter(Lot.is_deleted == False, Lot.company_id == current_user.company_id).count()
    lots = db.query(Lot).filter(Lot.is_deleted == False, Lot.company_id == current_user.company_id).offset(skip).limit(limit).all()
    
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
    if lot_in.design_number:
        design = db.query(Design).filter(Design.design_number.ilike(lot_in.design_number), Design.company_id == current_user.company_id).first()
        if not design:
            raise HTTPException(status_code=400, detail=f"Design '{lot_in.design_number}' not found. Please create the design first.")
        design_id = design.id
        product_id = design.product_id
    elif not design_id or not product_id:
        raise HTTPException(status_code=400, detail="design_number or design_id and product_id must be provided")

    lot = Lot(
        design_id=design_id,
        product_id=product_id,
        color=lot_in.color,
        size=lot_in.size,
        quantity=lot_in.quantity,
        lot_number=lot_number,
        barcode=barcode_string,
        current_process=current_process,
        factory_id=current_user.factory_id or 1,  # fallback if user has no factory_id
        company_id=current_user.company_id,
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
    if lot_in.design_number:
        design = db.query(Design).filter(Design.design_number.ilike(lot_in.design_number), Design.company_id == current_user.company_id).first()
        if not design:
            raise HTTPException(status_code=400, detail=f"Design '{lot_in.design_number}' not found.")
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
