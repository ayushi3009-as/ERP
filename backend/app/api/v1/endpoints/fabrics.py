from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.models.models import Fabric
from app.schemas.schemas import FabricCreate, FabricResponse, PaginatedResponse
from app.api.deps import get_current_user

router = APIRouter()

@router.get("", response_model=PaginatedResponse[FabricResponse])
def get_fabrics(
    db: Session = Depends(get_db),
    skip: int = Query(1, alias="page", ge=1),
    limit: int = Query(20, alias="per_page", ge=1, le=100),
    search: Optional[str] = None,
    current_user = Depends(get_current_user)
):
    offset = (skip - 1) * limit
    query = db.query(Fabric).filter(Fabric.company_id == current_user.company_id)
    if search:
        query = query.filter(Fabric.name.ilike(f"%{search}%"))
    total = query.count()
    items = query.order_by(Fabric.created_at.desc()).offset(offset).limit(limit).all()
    return {
        "items": items,
        "total": total,
        "page": skip,
        "page_size": limit,
        "total_pages": (total + limit - 1) // limit
    }

@router.post("", response_model=FabricResponse)
def create_fabric(
    fabric_in: FabricCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    db_fabric = Fabric(
        name=fabric_in.name,
        fabric_type=fabric_in.fabric_type,
        gsm=fabric_in.gsm,
        composition=fabric_in.composition,
        color=fabric_in.color,
        is_active=fabric_in.is_active,
        company_id=current_user.company_id
    )
    db.add(db_fabric)
    db.commit()
    db.refresh(db_fabric)
    return db_fabric

@router.put("/{fabric_id}", response_model=FabricResponse)
def update_fabric(
    fabric_id: int,
    fabric_in: FabricCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    db_fabric = db.query(Fabric).filter(Fabric.id == fabric_id, Fabric.company_id == current_user.company_id).first()
    if not db_fabric:
        raise HTTPException(status_code=404, detail="Fabric not found")
        
    db_fabric.name = fabric_in.name
    db_fabric.fabric_type = fabric_in.fabric_type
    db_fabric.gsm = fabric_in.gsm
    db_fabric.composition = fabric_in.composition
    db_fabric.color = fabric_in.color
    db_fabric.is_active = fabric_in.is_active
    
    db.commit()
    db.refresh(db_fabric)
    return db_fabric

@router.delete("/{fabric_id}")
def delete_fabric(
    fabric_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    db_fabric = db.query(Fabric).filter(Fabric.id == fabric_id, Fabric.company_id == current_user.company_id).first()
    if not db_fabric:
        raise HTTPException(status_code=404, detail="Fabric not found")
        
    db.delete(db_fabric)
    db.commit()
    return {"message": "Fabric deleted successfully"}
