from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.models.models import Design, Product, Category, Fabric
from app.schemas.schemas import DesignCreate, DesignResponse, PaginatedResponse
from app.api.deps import get_current_user

router = APIRouter()

def _get_or_create_product(db: Session, product_name: str, company_id: int) -> int:
    prod = db.query(Product).filter(
        (Product.name.ilike(product_name)) | (Product.code.ilike(product_name)),
        Product.company_id == company_id
    ).first()
    if not prod:
        import re
        base_code = re.sub(r'[^A-Z0-9]', '', product_name.upper())[:30]
        if not base_code:
            base_code = "PRD"
        unique_code = base_code
        counter = 1
        while db.query(Product).filter(Product.code == unique_code).first():
            unique_code = f"{base_code}-{counter}"
            counter += 1
            
        prod = Product(
            code=unique_code,
            name=product_name,
            company_id=company_id
        )
        db.add(prod)
        db.commit()
        db.refresh(prod)
    return prod.id

@router.get("", response_model=PaginatedResponse[DesignResponse])
def get_designs(
    db: Session = Depends(get_db),
    skip: int = Query(1, alias="page", ge=1),
    limit: int = Query(20, alias="per_page", ge=1, le=100),
    search: Optional[str] = None,
    current_user = Depends(get_current_user)
):
    offset = (skip - 1) * limit
    query = db.query(Design).filter(Design.company_id == current_user.company_id)
    if search:
        query = query.filter(Design.name.ilike(f"%{search}%") | Design.design_number.ilike(f"%{search}%"))
    total = query.count()
    items = query.order_by(Design.created_at.desc()).offset(offset).limit(limit).all()
    return {
        "items": items,
        "total": total,
        "page": skip,
        "page_size": limit,
        "total_pages": (total + limit - 1) // limit
    }

@router.post("", response_model=DesignResponse)
def create_design(
    design_in: DesignCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    prod_id = design_in.product_id
    if design_in.product_name:
        prod_id = _get_or_create_product(db, design_in.product_name, current_user.company_id)

    cat_id = design_in.category_id
    if design_in.category_name:
        cat = db.query(Category).filter(Category.name.ilike(design_in.category_name), Category.company_id == current_user.company_id).first()
        if not cat:
            cat = Category(name=design_in.category_name, company_id=current_user.company_id)
            db.add(cat)
            db.commit()
            db.refresh(cat)
        cat_id = cat.id

    fab_id = design_in.fabric_id
    if design_in.fabric_name:
        fab = db.query(Fabric).filter(Fabric.name.ilike(design_in.fabric_name), Fabric.company_id == current_user.company_id).first()
        if not fab:
            fab = Fabric(name=design_in.fabric_name, company_id=current_user.company_id)
            db.add(fab)
            db.commit()
            db.refresh(fab)
        fab_id = fab.id

    db_design = Design(
        design_number=design_in.design_number,
        name=design_in.name,
        product_id=prod_id,
        category_id=cat_id,
        fabric_id=fab_id,
        image_url=design_in.image_url,
        version=design_in.version,
        is_active=design_in.is_active,
        company_id=current_user.company_id
    )
    db.add(db_design)
    db.commit()
    db.refresh(db_design)
    return db_design

@router.put("/{design_id}", response_model=DesignResponse)
def update_design(
    design_id: int,
    design_in: DesignCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    db_design = db.query(Design).filter(Design.id == design_id, Design.company_id == current_user.company_id).first()
    if not db_design:
        raise HTTPException(status_code=404, detail="Design not found")
        
    prod_id = design_in.product_id
    if design_in.product_name:
        prod_id = _get_or_create_product(db, design_in.product_name, current_user.company_id)

    cat_id = design_in.category_id
    if design_in.category_name:
        cat = db.query(Category).filter(Category.name.ilike(design_in.category_name), Category.company_id == current_user.company_id).first()
        if not cat:
            cat = Category(name=design_in.category_name, company_id=current_user.company_id)
            db.add(cat)
            db.commit()
            db.refresh(cat)
        cat_id = cat.id

    fab_id = design_in.fabric_id
    if design_in.fabric_name:
        fab = db.query(Fabric).filter(Fabric.name.ilike(design_in.fabric_name), Fabric.company_id == current_user.company_id).first()
        if not fab:
            fab = Fabric(name=design_in.fabric_name, company_id=current_user.company_id)
            db.add(fab)
            db.commit()
            db.refresh(fab)
        fab_id = fab.id

    db_design.design_number = design_in.design_number
    db_design.name = design_in.name
    db_design.product_id = prod_id
    db_design.category_id = cat_id
    db_design.fabric_id = fab_id
    db_design.image_url = design_in.image_url
    db_design.version = design_in.version
    db_design.is_active = design_in.is_active
    
    db.commit()
    db.refresh(db_design)
    return db_design

@router.delete("/{design_id}")
def delete_design(
    design_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    db_design = db.query(Design).filter(Design.id == design_id, Design.company_id == current_user.company_id).first()
    if not db_design:
        raise HTTPException(status_code=404, detail="Design not found")
        
    db.delete(db_design)
    db.commit()
    return {"message": "Design deleted successfully"}
