from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.api.deps import get_db, get_current_user
from app.models.models import InternalPayment, User
from app.schemas.schemas import InternalPaymentCreate, InternalPaymentResponse, PaginatedResponse
from datetime import datetime

router = APIRouter()

@router.get("", response_model=PaginatedResponse[InternalPaymentResponse])
def read_payments(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    search: str = "",
    current_user: User = Depends(get_current_user),
) -> Any:
    query = db.query(InternalPayment).filter(
        InternalPayment.factory_id == current_user.factory_id,
        InternalPayment.company_id == current_user.company_id
    )
    
    if search:
        query = query.filter(InternalPayment.payment_id.ilike(f"%{search}%"))
        
    total = query.count()
    payments = query.order_by(InternalPayment.created_at.desc()).offset(skip).limit(limit).all()
    
    return {
        "items": payments,
        "total": total,
        "page": (skip // limit) + 1 if limit > 0 else 1,
        "page_size": limit,
        "total_pages": (total + limit - 1) // limit if limit > 0 else 1
    }

@router.post("", response_model=InternalPaymentResponse)
def create_payment(
    *,
    db: Session = Depends(get_db),
    payment_in: InternalPaymentCreate,
    current_user: User = Depends(get_current_user),
) -> Any:
    payment = InternalPayment(
        **payment_in.model_dump(),
        factory_id=current_user.factory_id,
        company_id=current_user.company_id
    )
    # Ensure payment date is set if missing
    if not payment.payment_date:
        payment.payment_date = func.now()
        
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment

@router.put("/{payment_id}", response_model=InternalPaymentResponse)
def update_payment(
    *,
    db: Session = Depends(get_db),
    payment_id: int,
    payment_in: InternalPaymentCreate,
    current_user: User = Depends(get_current_user),
) -> Any:
    payment = db.query(InternalPayment).filter(
        InternalPayment.id == payment_id,
        InternalPayment.factory_id == current_user.factory_id,
        InternalPayment.company_id == current_user.company_id
    ).first()
    
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    update_data = payment_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(payment, field, value)
        
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment

@router.delete("/{payment_id}")
def delete_payment(
    *,
    db: Session = Depends(get_db),
    payment_id: int,
    current_user: User = Depends(get_current_user),
) -> Any:
    payment = db.query(InternalPayment).filter(
        InternalPayment.id == payment_id,
        InternalPayment.factory_id == current_user.factory_id,
        InternalPayment.company_id == current_user.company_id
    ).first()
    
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
        
    db.delete(payment)
    db.commit()
    return {"success": True}
