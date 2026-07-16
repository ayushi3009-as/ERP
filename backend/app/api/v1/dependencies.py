from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from functools import wraps
from typing import List, Optional

from app.core.database import get_db
from app.core.security import decode_token
from app.models.models import User, UserRole

security_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    payload = decode_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )
    if current_user.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User has been deleted",
        )
    return current_user


def require_role(allowed_roles: List[UserRole]):
    def role_checker(
        current_user: User = Depends(get_current_active_user),
    ) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return role_checker


class TenantContext:
    """Effective company/factory scope for the current request.

    - super_admin: company_id=None, factory_id=None -> sees everything
      (endpoints must treat None as "no filter", never as "match NULL").
    - company_admin: company_id set, factory_id=None -> all factories of
      that company.
    - everyone else: both set -> single factory, exactly like a
      single-factory ERP looks and behaves today.

    Optional `factory_id` query param lets a company_admin/super_admin
    switch which factory's data they're viewing without re-login; it is
    validated against what the user is actually allowed to see.
    """

    def __init__(self, company_id: Optional[int], factory_id: Optional[int]):
        self.company_id = company_id
        self.factory_id = factory_id

    def apply(self, query, model):
        """Filter a SQLAlchemy query by tenant scope if the model supports it."""
        if hasattr(model, "factory_id") and self.factory_id is not None:
            query = query.filter(model.factory_id == self.factory_id)
        elif hasattr(model, "company_id") and self.company_id is not None:
            query = query.filter(model.company_id == self.company_id)
        return query


def get_tenant_context(
    factory_id: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> TenantContext:
    from app.models.models import Factory, UserRole as _UR

    if current_user.role == _UR.SUPER_ADMIN:
        if factory_id is not None:
            f = db.query(Factory).filter(Factory.id == factory_id).first()
            if not f:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Factory not found")
            return TenantContext(company_id=f.company_id, factory_id=f.id)
        return TenantContext(company_id=None, factory_id=None)

    if current_user.role == _UR.COMPANY_ADMIN:
        target_factory = factory_id
        if target_factory is not None:
            f = (
                db.query(Factory)
                .filter(
                    Factory.id == target_factory,
                    Factory.company_id == current_user.company_id,
                )
                .first()
            )
            if not f:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Factory not found")
        return TenantContext(
            company_id=current_user.company_id, factory_id=target_factory
        )

    # everyone else is locked to their own factory regardless of query param
    return TenantContext(
        company_id=current_user.company_id, factory_id=current_user.factory_id
    )
