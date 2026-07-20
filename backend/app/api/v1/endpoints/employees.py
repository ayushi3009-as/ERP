from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
import uuid
import string
import random

from app.core.database import get_db
from app.api.v1.dependencies import get_current_active_user as get_current_user
from app.models.models import User, UserRole
from sqlalchemy.exc import IntegrityError
from app.schemas.schemas import EmployeeCreate, EmployeeResponse, PaginatedResponse, EmployeeUpdate

router = APIRouter()

def generate_random_password(length=12):
    chars = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(random.choice(chars) for _ in range(length))

@router.get("", response_model=PaginatedResponse[EmployeeResponse])
def get_employees(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100
):
    query = db.query(User).filter(
        User.company_id == current_user.company_id,
        User.factory_id == current_user.factory_id,
        User.role.in_([UserRole.WORKER, UserRole.OPERATOR]),
        User.is_deleted == False
    )
    total = query.count()
    employees = query.order_by(User.created_at.desc()).offset(skip).limit(limit).all()
    
    return {
        "items": employees,
        "total": total,
        "page": (skip // limit) + 1 if limit > 0 else 1,
        "page_size": limit,
        "total_pages": (total + limit - 1) // limit if limit > 0 else 1
    }

@router.post("", response_model=EmployeeResponse)
def create_employee(
    employee_in: EmployeeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if db.query(User).filter(User.email == employee_in.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if db.query(User).filter(User.username == employee_in.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")

    role_enum = UserRole.WORKER
    if employee_in.role.lower() == "operator":
        role_enum = UserRole.OPERATOR

    barcode = employee_in.barcode if employee_in.barcode else f"EMP-{uuid.uuid4().hex[:6].upper()}"

    db_user = User(
        email=employee_in.email,
        username=employee_in.username,
        full_name=employee_in.full_name,
        phone=employee_in.phone,
        role=role_enum,
        company_id=current_user.company_id,
        factory_id=current_user.factory_id,
        barcode=barcode,
        employee_id=employee_in.employee_id,
        joined_date=employee_in.joined_date,
        settings=employee_in.settings or {},
        password_hash="DUMMY_HASH", 
        is_active=True,
    )
    
    try:
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="A user with this email, username, or barcode already exists")

@router.put("/{user_id}", response_model=EmployeeResponse)
def update_employee(
    user_id: int,
    employee_in: EmployeeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db_user = db.query(User).filter(User.id == user_id, User.is_deleted == False, User.company_id == current_user.company_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Employee not found")

    update_data = employee_in.dict(exclude_unset=True)
    if "role" in update_data and update_data["role"]:
        db_user.role = UserRole.OPERATOR if update_data["role"].lower() == "operator" else UserRole.WORKER
        del update_data["role"]

    for field, value in update_data.items():
        if field == "settings" and value:
            # Merge settings
            current_settings = db_user.settings or {}
            db_user.settings = {**current_settings, **value}
        else:
            setattr(db_user, field, value)

    try:
        db.commit()
        db.refresh(db_user)
        return db_user
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="A user with this email, username, or barcode already exists")

@router.delete("/{user_id}")
def delete_employee(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db_user = db.query(User).filter(User.id == user_id, User.is_deleted == False, User.company_id == current_user.company_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    db_user.is_deleted = True
    db.commit()
    return {"message": "Employee deleted successfully"}
