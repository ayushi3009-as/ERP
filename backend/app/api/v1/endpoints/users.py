from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.models import User, UserRole, AuditLog
from app.schemas.schemas import (
    UserCreate,
    UserUpdate,
    UserResponse,
    PaginatedResponse,
    MessageResponse,
)
from app.api.v1.dependencies import get_current_active_user, require_role

router = APIRouter()


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


ADMIN_ROLES = [UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN]


@router.get("/", response_model=PaginatedResponse[UserResponse])
def list_users(
    request: Request,
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: User = Depends(require_role(ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    query = db.query(User).filter(User.is_deleted == False, User.company_id == current_user.company_id)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (User.full_name.ilike(search_term))
            | (User.email.ilike(search_term))
            | (User.username.ilike(search_term))
        )

    if role:
        query = query.filter(User.role == role)

    if is_active is not None:
        query = query.filter(User.is_active == is_active)

    total = query.count()
    offset = (page - 1) * page_size
    users = query.order_by(User.id.desc()).offset(offset).limit(page_size).all()

    total_pages = (total + page_size - 1) // page_size if page_size > 0 else 0
    return PaginatedResponse(
        items=users,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    request: Request,
    current_user: User = Depends(require_role(ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id, User.is_deleted == False, User.company_id == current_user.company_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return user


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    request: Request,
    payload: UserCreate,
    current_user: User = Depends(require_role(ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    existing = (
        db.query(User)
        .filter((User.email == payload.email) | (User.username == payload.username))
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email or username already exists",
        )

    try:
        user_role = UserRole(payload.role)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role: {payload.role}",
        )

    if user_role == UserRole.SUPER_ADMIN and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only super admins can create other super admins",
        )

    user = User(
        email=payload.email,
        username=payload.username,
        password_hash=get_password_hash(payload.password),
        full_name=payload.full_name,
        phone=payload.phone,
        role=user_role,
        created_by=current_user.id,
        company_id=current_user.company_id,
        factory_id=current_user.factory_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    _create_audit_log(
        db=db,
        user_id=current_user.id,
        action="create",
        module="users",
        record_id=user.id,
        record_type="user",
        ip_address=_get_client_ip(request),
        user_agent=request.headers.get("user-agent", "")[:500],
        new_values={
            "email": user.email,
            "username": user.username,
            "role": user.role.value,
            "full_name": user.full_name,
        },
    )

    return user


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    request: Request,
    payload: UserUpdate,
    current_user: User = Depends(require_role(ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id, User.is_deleted == False, User.company_id == current_user.company_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    old_values = {
        "full_name": user.full_name,
        "phone": user.phone,
        "role": user.role.value,
        "is_active": user.is_active,
    }

    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.phone is not None:
        user.phone = payload.phone
    if payload.role is not None:
        try:
            new_role = UserRole(payload.role)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid role: {payload.role}",
            )
        if (
            new_role == UserRole.SUPER_ADMIN
            and current_user.role != UserRole.SUPER_ADMIN
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only super admins can assign super admin role",
            )
        user.role = new_role
    if payload.is_active is not None:
        user.is_active = payload.is_active

    new_values = {
        "full_name": user.full_name,
        "phone": user.phone,
        "role": user.role.value,
        "is_active": user.is_active,
    }

    db.commit()
    db.refresh(user)

    _create_audit_log(
        db=db,
        user_id=current_user.id,
        action="update",
        module="users",
        record_id=user.id,
        record_type="user",
        ip_address=_get_client_ip(request),
        user_agent=request.headers.get("user-agent", "")[:500],
        old_values=old_values,
        new_values=new_values,
    )

    return user


@router.delete("/{user_id}", response_model=MessageResponse)
def delete_user(
    user_id: int,
    request: Request,
    current_user: User = Depends(require_role(ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id, User.is_deleted == False, User.company_id == current_user.company_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account",
        )

    if user.role == UserRole.SUPER_ADMIN and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only super admins can delete super admin accounts",
        )

    old_values = {
        "email": user.email,
        "username": user.username,
        "is_active": user.is_active,
        "is_deleted": user.is_deleted,
    }

    user.is_deleted = True
    user.is_active = False
    db.commit()

    _create_audit_log(
        db=db,
        user_id=current_user.id,
        action="delete",
        module="users",
        record_id=user.id,
        record_type="user",
        ip_address=_get_client_ip(request),
        user_agent=request.headers.get("user-agent", "")[:500],
        old_values=old_values,
        new_values={"is_active": False, "is_deleted": True},
    )

    return MessageResponse(message="User deleted successfully")
