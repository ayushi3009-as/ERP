from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.models.models import Company, NumberSeries, AuditLog, UserRole
from app.schemas.schemas import (
    CompanyCreate,
    CompanyUpdate,
    CompanyResponse,
    MessageResponse,
)
from app.api.v1.dependencies import get_current_active_user, require_role
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()

ADMIN_ROLES = [UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN]


class NumberSeriesCreate(BaseModel):
    series_name: str
    prefix: str
    current_number: Optional[int] = 0
    pad_length: Optional[int] = 5
    suffix: Optional[str] = None
    module: str


class NumberSeriesUpdate(BaseModel):
    series_name: Optional[str] = None
    prefix: Optional[str] = None
    current_number: Optional[int] = None
    pad_length: Optional[int] = None
    suffix: Optional[str] = None
    module: Optional[str] = None


class NumberSeriesResponse(BaseModel):
    id: int
    series_name: str
    prefix: str
    current_number: int
    pad_length: int
    suffix: Optional[str] = None
    module: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


def _create_audit_log(
    db: Session,
    user_id: int | None,
    action: str,
    module: str,
    record_id: int | None = None,
    record_type: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    old_values: dict | None = None,
    new_values: dict | None = None,
):
    log = AuditLog(
        user_id=user_id,
        action=action,
        module=module,
        record_id=record_id,
        record_type=record_type,
        old_values=old_values,
        new_values=new_values,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(log)
    db.commit()


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.get("/", response_model=Optional[CompanyResponse])
def get_company(
    current_user=Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    company = db.query(Company).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found. Please create one.",
        )
    return company


@router.post("/", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
def create_company(
    request: Request,
    payload: CompanyCreate,
    current_user=Depends(require_role([UserRole.SUPER_ADMIN])),
    db: Session = Depends(get_db),
):
    existing = db.query(Company).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Company already exists. Use PUT to update.",
        )

    company = Company(
        name=payload.name,
        short_name=payload.short_name,
        address=payload.address,
        city=payload.city,
        state=payload.state,
        pincode=payload.pincode,
        phone=payload.phone,
        email=payload.email,
        website=payload.website,
        gst_number=payload.gst_number,
        pan_number=payload.pan_number,
        created_by=current_user.id,
    )
    db.add(company)
    db.commit()
    db.refresh(company)

    _create_audit_log(
        db=db,
        user_id=current_user.id,
        action="create",
        module="company",
        record_id=company.id,
        record_type="company",
        ip_address=_get_client_ip(request),
        user_agent=request.headers.get("user-agent", "")[:500],
        new_values={"name": company.name},
    )

    return company


@router.put("/", response_model=CompanyResponse)
def update_company(
    request: Request,
    payload: CompanyUpdate,
    current_user=Depends(require_role(ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    company = db.query(Company).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )

    old_values = {
        "name": company.name,
        "short_name": company.short_name,
        "phone": company.phone,
        "email": company.email,
        "gst_number": company.gst_number,
    }

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(company, field, value)

    db.commit()
    db.refresh(company)

    _create_audit_log(
        db=db,
        user_id=current_user.id,
        action="update",
        module="company",
        record_id=company.id,
        record_type="company",
        ip_address=_get_client_ip(request),
        user_agent=request.headers.get("user-agent", "")[:500],
        old_values=old_values,
        new_values=update_data,
    )

    return company


@router.get("/number-series", response_model=List[NumberSeriesResponse])
def list_number_series(
    module: Optional[str] = None,
    current_user=Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    query = db.query(NumberSeries)
    if module:
        query = query.filter(NumberSeries.module == module)
    return query.order_by(NumberSeries.id).all()


@router.post(
    "/number-series",
    response_model=NumberSeriesResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_number_series(
    request: Request,
    payload: NumberSeriesCreate,
    current_user=Depends(require_role(ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    existing = (
        db.query(NumberSeries)
        .filter(NumberSeries.series_name == payload.series_name)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Number series with this name already exists",
        )

    ns = NumberSeries(
        series_name=payload.series_name,
        prefix=payload.prefix,
        current_number=payload.current_number,
        pad_length=payload.pad_length,
        suffix=payload.suffix,
        module=payload.module,
        created_by=current_user.id,
    )
    db.add(ns)
    db.commit()
    db.refresh(ns)

    _create_audit_log(
        db=db,
        user_id=current_user.id,
        action="create",
        module="number_series",
        record_id=ns.id,
        record_type="number_series",
        ip_address=_get_client_ip(request),
        user_agent=request.headers.get("user-agent", "")[:500],
        new_values={
            "series_name": ns.series_name,
            "prefix": ns.prefix,
            "module": ns.module,
        },
    )

    return ns


@router.put("/number-series/{ns_id}", response_model=NumberSeriesResponse)
def update_number_series(
    ns_id: int,
    request: Request,
    payload: NumberSeriesUpdate,
    current_user=Depends(require_role(ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    ns = db.query(NumberSeries).filter(NumberSeries.id == ns_id).first()
    if not ns:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Number series not found",
        )

    old_values = {
        "series_name": ns.series_name,
        "prefix": ns.prefix,
        "current_number": ns.current_number,
        "pad_length": ns.pad_length,
    }

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(ns, field, value)

    db.commit()
    db.refresh(ns)

    _create_audit_log(
        db=db,
        user_id=current_user.id,
        action="update",
        module="number_series",
        record_id=ns.id,
        record_type="number_series",
        ip_address=_get_client_ip(request),
        user_agent=request.headers.get("user-agent", "")[:500],
        old_values=old_values,
        new_values=update_data,
    )

    return ns
