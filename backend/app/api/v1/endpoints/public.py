from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Any

from app.core.database import get_db
from app.models.models import Lot, Design, Product, Fabric, Category

router = APIRouter()

@router.get("/lot/{barcode}")
def get_public_lot_details(barcode: str, db: Session = Depends(get_db)) -> Any:
    """
    Public endpoint to fetch detailed Lot information for scanning via Google Lens / Camera QR
    without needing login.
    """
    lot = db.query(Lot).filter(Lot.barcode == barcode.strip(), Lot.is_deleted == False).first()
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")
        
    design = db.query(Design).filter(Design.id == lot.design_id).first()
    product = db.query(Product).filter(Product.id == lot.product_id).first()
    
    fabric_name = "N/A"
    category_name = "N/A"
    
    if product:
        if product.fabric_id:
            fabric = db.query(Fabric).filter(Fabric.id == product.fabric_id).first()
            if fabric:
                fabric_name = fabric.name
        if product.category_id:
            cat = db.query(Category).filter(Category.id == product.category_id).first()
            if cat:
                category_name = cat.name

    return {
        "success": True,
        "lot_number": lot.lot_number,
        "barcode": lot.barcode,
        "size": lot.size or "N/A",
        "quantity": lot.quantity or 0,
        "current_process": lot.current_process or "Planning",
        "design_number": design.design_number if design else "N/A",
        "design_name": design.name if design else "N/A",
        "product_name": product.name if product else "N/A",
        "product_code": product.code if product else "N/A",
        "fabric_name": fabric_name,
        "category_name": category_name,
        "created_at": lot.created_at.isoformat() if lot.created_at else None
    }
