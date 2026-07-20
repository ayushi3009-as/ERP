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

    # Extract department from settings payload if provided
    department_str = None
    if employee_in.settings and "department" in employee_in.settings:
        department_str = employee_in.settings["department"]

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
        avatar_url=department_str, # Store department inside avatar_url
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

    # Validate email uniqueness if changed
    if employee_in.email and employee_in.email != db_user.email:
        if db.query(User).filter(User.email == employee_in.email).first():
            raise HTTPException(status_code=400, detail="Email is already registered by another user")
            
    # Validate username uniqueness if changed
    if employee_in.username and employee_in.username != db_user.username:
        if db.query(User).filter(User.username == employee_in.username).first():
            raise HTTPException(status_code=400, detail="Username is already taken by another user")

    # Validate barcode uniqueness if changed
    if employee_in.barcode and employee_in.barcode != db_user.barcode:
        if db.query(User).filter(User.barcode == employee_in.barcode).first():
            raise HTTPException(status_code=400, detail="Barcode is already assigned to another employee")

    update_data = employee_in.dict(exclude_unset=True)
    if "role" in update_data and update_data["role"]:
        db_user.role = UserRole.OPERATOR if update_data["role"].lower() == "operator" else UserRole.WORKER
        del update_data["role"]

    # Extract department from settings payload if provided
    if "settings" in update_data and update_data["settings"] and "department" in update_data["settings"]:
        db_user.avatar_url = update_data["settings"]["department"]
        del update_data["settings"]

    for field, value in update_data.items():
        if field != "settings":
            setattr(db_user, field, value)

    try:
        db.commit()
        db.refresh(db_user)
        return db_user
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Failed to save update. Field constraint conflict.")

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
