from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.models.models import Product, Category, Fabric
from app.schemas.schemas import ProductCreate, ProductResponse, PaginatedResponse
from app.api.deps import get_current_user

router = APIRouter()

@router.get("", response_model=PaginatedResponse[ProductResponse])
def get_products(
    db: Session = Depends(get_db),
    skip: int = Query(0, alias="page", ge=1),
    limit: int = Query(20, alias="per_page", ge=1, le=100),
    search: Optional[str] = None,
    current_user = Depends(get_current_user)
):
    offset = (skip - 1) * limit if skip > 0 else 0
    query = db.query(Product).filter(Product.company_id == current_user.company_id)
    
    if search:
        query = query.filter(Product.name.ilike(f"%{search}%") | Product.code.ilike(f"%{search}%"))
        
    total = query.count()
    items = query.order_by(Product.created_at.desc()).offset(offset).limit(limit).all()
    
    return {
        "items": items,
        "data": items,
        "total": total,
        "page": skip,
        "page_size": limit,
        "total_pages": (total + limit - 1) // limit
    }

@router.post("", response_model=ProductResponse)
def create_product(
    product_in: ProductCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    cat_id = product_in.category_id
    if product_in.category_name:
        cat = db.query(Category).filter(Category.name.ilike(product_in.category_name), Category.company_id == current_user.company_id).first()
        if not cat:
            cat = Category(name=product_in.category_name, company_id=current_user.company_id)
            db.add(cat)
            db.commit()
            db.refresh(cat)
        cat_id = cat.id

    fab_id = product_in.fabric_id
    if product_in.fabric_name:
        fab = db.query(Fabric).filter(Fabric.name.ilike(product_in.fabric_name), Fabric.company_id == current_user.company_id).first()
        if not fab:
            fab = Fabric(name=product_in.fabric_name, company_id=current_user.company_id)
            db.add(fab)
            db.commit()
            db.refresh(fab)
        fab_id = fab.id

    db_product = Product(
        code=product_in.code,
        name=product_in.name,
        category_id=cat_id,
        fabric_id=fab_id,
        available_sizes=product_in.available_sizes,
        image_url=product_in.image_url,
        is_active=product_in.is_active,
        company_id=current_user.company_id
    )
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return db_product

@router.put("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: int,
    product_in: ProductCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    db_product = db.query(Product).filter(Product.id == product_id, Product.company_id == current_user.company_id).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
        
    cat_id = product_in.category_id
    if product_in.category_name:
        cat = db.query(Category).filter(Category.name.ilike(product_in.category_name), Category.company_id == current_user.company_id).first()
        if not cat:
            cat = Category(name=product_in.category_name, company_id=current_user.company_id)
            db.add(cat)
            db.commit()
            db.refresh(cat)
        cat_id = cat.id

    fab_id = product_in.fabric_id
    if product_in.fabric_name:
        fab = db.query(Fabric).filter(Fabric.name.ilike(product_in.fabric_name), Fabric.company_id == current_user.company_id).first()
        if not fab:
            fab = Fabric(name=product_in.fabric_name, company_id=current_user.company_id)
            db.add(fab)
            db.commit()
            db.refresh(fab)
        fab_id = fab.id

    update_data = product_in.model_dump(exclude_unset=True)
    update_data["category_id"] = cat_id
    update_data["fabric_id"] = fab_id
    # Remove the name fields so they don't try to save to the Product table directly
    update_data.pop("category_name", None)
    update_data.pop("fabric_name", None)

    for field, value in update_data.items():
        setattr(db_product, field, value)
    
    db.commit()
    db.refresh(db_product)
    return db_product

@router.delete("/{product_id}")
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    db_product = db.query(Product).filter(Product.id == product_id, Product.company_id == current_user.company_id).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
        
    db.delete(db_product)
    db.commit()
    return {"message": "Product deleted successfully"}
