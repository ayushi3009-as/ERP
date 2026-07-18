from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.models.models import Category
from app.schemas.schemas import CategoryCreate, CategoryResponse, PaginatedResponse
from app.api.deps import get_current_user

router = APIRouter()

@router.get("", response_model=PaginatedResponse[CategoryResponse])
def get_categories(
    db: Session = Depends(get_db),
    skip: int = Query(1, alias="page", ge=1),
    limit: int = Query(20, alias="per_page", ge=1, le=100),
    search: Optional[str] = None,
    current_user = Depends(get_current_user)
):
    offset = (skip - 1) * limit
    query = db.query(Category).filter(Category.company_id == current_user.company_id)
    if search:
        query = query.filter(Category.name.ilike(f"%{search}%"))
    total = query.count()
    items = query.order_by(Category.created_at.desc()).offset(offset).limit(limit).all()
    return {
        "items": items,
        "total": total,
        "page": skip,
        "page_size": limit,
        "total_pages": (total + limit - 1) // limit
    }

@router.post("", response_model=CategoryResponse)
def create_category(
    category_in: CategoryCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    db_category = Category(
        name=category_in.name,
        description=category_in.description,
        is_active=category_in.is_active,
        company_id=current_user.company_id
    )
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category

@router.put("/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: int,
    category_in: CategoryCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    db_category = db.query(Category).filter(Category.id == category_id, Category.company_id == current_user.company_id).first()
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")
        
    db_category.name = category_in.name
    db_category.description = category_in.description
    db_category.is_active = category_in.is_active
    
    db.commit()
    db.refresh(db_category)
    return db_category

@router.delete("/{category_id}")
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    db_category = db.query(Category).filter(Category.id == category_id, Category.company_id == current_user.company_id).first()
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")
        
    db.delete(db_category)
    db.commit()
    return {"message": "Category deleted successfully"}
