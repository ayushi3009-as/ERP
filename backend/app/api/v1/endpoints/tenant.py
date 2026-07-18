from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional
import os
import shutil
import uuid

from app.core.database import get_db
from app.models.models import Company, User, UserRole, Factory
from app.core.security import get_password_hash

router = APIRouter()

class TenantRegisterRequest(BaseModel):
    company_name: str
    admin_name: str
    admin_email: EmailStr
    password: str
    phone: Optional[str] = None
    subscription_plan: str
    payment_screenshot_url: Optional[str] = None

@router.post("/upload-payment")
async def upload_payment(file: UploadFile = File(...)):
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    # Generate unique filename
    ext = file.filename.split(".")[-1]
    unique_filename = f"{uuid.uuid4()}.{ext}"
    file_path = os.path.join("uploads", unique_filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"url": f"/uploads/{unique_filename}"}

@router.post("/register")
def register_tenant(payload: TenantRegisterRequest, db: Session = Depends(get_db)):
    # Check if email is already used
    existing_user = db.query(User).filter(User.email == payload.admin_email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    # Create Company
    company = Company(
        name=payload.company_name,
        email=payload.admin_email,
        phone=payload.phone,
        subscription_plan=payload.subscription_plan,
        payment_screenshot_url=payload.payment_screenshot_url,
        tenant_status="pending",
        is_approved=False
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    
    # Create default factory for company
    factory = Factory(
        company_id=company.id,
        name=company.name,
        code="MAIN",
        is_default=True
    )
    db.add(factory)
    db.commit()
    db.refresh(factory)
    
    # Create Admin User
    user = User(
        email=payload.admin_email,
        username=payload.admin_email.split('@')[0],
        password_hash=get_password_hash(payload.password),
        full_name=payload.admin_name,
        phone=payload.phone,
        role=UserRole.COMPANY_ADMIN,
        company_id=company.id,
        factory_id=factory.id,
        is_active=True,
        is_verified=True
    )
    db.add(user)
    db.commit()
    
    return {"message": "Registration successful. Pending Super Admin approval."}
