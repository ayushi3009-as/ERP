from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user
from app.models.models import Service, User
from app.schemas.schemas import ServiceCreate, ServiceResponse, PaginatedResponse

router = APIRouter()

@router.get("", response_model=PaginatedResponse[ServiceResponse])
def read_services(
    db: Session = Depends(get_db),
    page: int = 1,
    per_page: int = 100,
    search: str = "",
    current_user: User = Depends(get_current_user),
) -> Any:
    query = db.query(Service).filter(Service.company_id == current_user.company_id)
    
    if search:
        query = query.filter(Service.name.ilike(f"%{search}%"))
        
    total = query.count()
    offset = (page - 1) * per_page
    services = query.offset(offset).limit(per_page).all()
    
    return {
        "items": services,
        "total": total,
        "page": page,
        "page_size": per_page,
        "total_pages": (total + per_page - 1) // per_page if per_page > 0 else 1
    }

@router.post("", response_model=ServiceResponse)
def create_service(
    *,
    db: Session = Depends(get_db),
    service_in: ServiceCreate,
    current_user: User = Depends(get_current_user),
) -> Any:
    service = Service(
        **service_in.model_dump(),
        company_id=current_user.company_id
    )
    db.add(service)
    db.commit()
    db.refresh(service)
    return service

@router.put("/{service_id}", response_model=ServiceResponse)
def update_service(
    *,
    db: Session = Depends(get_db),
    service_id: int,
    service_in: ServiceCreate,
    current_user: User = Depends(get_current_user),
) -> Any:
    service = db.query(Service).filter(
        Service.id == service_id,
        Service.company_id == current_user.company_id
    ).first()
    
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
        
    update_data = service_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(service, field, value)
        
    db.add(service)
    db.commit()
    db.refresh(service)
    return service

@router.delete("/{service_id}")
def delete_service(
    *,
    db: Session = Depends(get_db),
    service_id: int,
    current_user: User = Depends(get_current_user),
) -> Any:
    service = db.query(Service).filter(
        Service.id == service_id,
        Service.company_id == current_user.company_id
    ).first()
    
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
        
    db.delete(service)
    db.commit()
    return {"success": True}
