from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Any
import uuid
from datetime import datetime

from app.core.database import get_db
from app.models.models import Lot, ProductionStage
from app.schemas.schemas import LotCreate, LotResponse, PaginatedResponse, PaginationParams
from app.api.deps import get_current_active_user

router = APIRouter()

@router.get("/", response_model=PaginatedResponse)
def get_lots(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: Any = Depends(get_current_active_user)
) -> Any:
    """
    Retrieve lots.
    """
    total = db.query(Lot).filter(Lot.is_deleted == False).count()
    lots = db.query(Lot).filter(Lot.is_deleted == False).offset(skip).limit(limit).all()
    
    return {
        "items": lots,
        "total": total,
        "page": (skip // limit) + 1 if limit > 0 else 1,
        "page_size": limit,
        "total_pages": (total + limit - 1) // limit if limit > 0 else 1
    }

@router.post("/", response_model=LotResponse)
def create_lot(
    *,
    db: Session = Depends(get_db),
    lot_in: LotCreate,
    current_user: Any = Depends(get_current_active_user)
) -> Any:
    """
    Create new lot.
    """
    # Auto-generate lot_number and barcode
    today = datetime.now()
    prefix = f"LOT-{today.strftime('%Y%m%d')}"
    
    # Simple generation: count existing lots today to append a sequential number
    count = db.query(Lot).filter(Lot.lot_number.like(f"{prefix}%")).count()
    lot_number = f"{prefix}-{count + 1:04d}"
    
    barcode_string = str(uuid.uuid4())
    
    lot = Lot(
        design_id=lot_in.design_id,
        product_id=lot_in.product_id,
        size=lot_in.size,
        quantity=lot_in.quantity,
        lot_number=lot_number,
        barcode=barcode_string,
        current_process=ProductionStage.PLANNING.value,
        factory_id=current_user.factory_id or 1,  # fallback if user has no factory_id
        created_by=current_user.id
    )
    db.add(lot)
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
    lot = db.query(Lot).filter(Lot.id == id, Lot.is_deleted == False).first()
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
    lot = db.query(Lot).filter(Lot.id == id).first()
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")
    
    lot.is_deleted = True
    db.commit()
    return {"success": True, "message": "Lot deleted successfully"}
