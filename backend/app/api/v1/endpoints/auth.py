from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_totp_secret,
    verify_totp,
    get_totp_uri,
)
from app.core.config import settings
from app.models.models import User, UserSession, UserRole, AuditLog
from app.schemas.schemas import (
    Token,
    LoginRequest,
    MessageResponse,
    UserResponse,
)
from app.api.v1.dependencies import get_current_active_user

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


@router.post("/login", response_model=Token)
def login(
    request: Request,
    payload: LoginRequest,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        if user:
            user.failed_attempts = (user.failed_attempts or 0) + 1
            if user.failed_attempts >= 5:
                user.locked_until = datetime.utcnow() + timedelta(minutes=15)
            db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if user.locked_until and user.locked_until > datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Account is locked. Try again later.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    # SaaS Model: Only allow admins to login
    user_role_val = (user.role.value if hasattr(user.role, 'value') else str(user.role)).lower()
    if user_role_val not in [UserRole.SUPER_ADMIN.value.lower(), UserRole.COMPANY_ADMIN.value.lower()]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted: Only administrators can log in to this portal.",
        )

    # SaaS Multi-Tenancy Check for Company Admins
    if user_role_val == UserRole.COMPANY_ADMIN.value.lower():
        if not user.company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account is not associated with any company.",
            )
        
        # Load the company and check its status
        from app.models.models import Company
        company = db.query(Company).filter(Company.id == user.company_id).first()
        if not company:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Associated company not found.",
            )
        if not company.is_approved:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your company account is pending approval from the Super Admin.",
            )
        if company.tenant_status == "suspended":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your company account has been suspended.",
            )
        if company.subscription_expiry and company.subscription_expiry < datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your subscription has expired. Please contact the Super Admin.",
            )

    if user.totp_enabled:
        if not hasattr(payload, "totp_code") or not payload.totp_code:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="2FA code required",
            )
        if not verify_totp(user.totp_secret, payload.totp_code):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid 2FA code",
            )

    user.failed_attempts = 0
    user.locked_until = None
    user.last_login = datetime.utcnow()

    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email, "role": user.role.value}
    )
    refresh_token = create_refresh_token(
        data={"sub": str(user.id), "email": user.email, "role": user.role.value}
    )

    session = UserSession(
        user_id=user.id,
        refresh_token=refresh_token,
        ip_address=_get_client_ip(request),
        user_agent=request.headers.get("user-agent", "")[:500],
        expires_at=datetime.utcnow()
        + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(session)
    db.commit()

    _create_audit_log(
        db=db,
        user_id=user.id,
        action="login",
        module="auth",
        ip_address=_get_client_ip(request),
        user_agent=request.headers.get("user-agent", "")[:500],
    )

    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
    )





@router.post("/logout", response_model=MessageResponse)
def logout(
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        payload = decode_token(token)
        if payload and payload.get("type") == "refresh":
            db.query(UserSession).filter(UserSession.refresh_token == token).update(
                {"is_revoked": True}
            )

    db.query(UserSession).filter(
        UserSession.user_id == current_user.id,
        UserSession.is_revoked == False,
    ).update({"is_revoked": True})
    db.commit()

    _create_audit_log(
        db=db,
        user_id=current_user.id,
        action="logout",
        module="auth",
        ip_address=_get_client_ip(request),
        user_agent=request.headers.get("user-agent", "")[:500],
    )

    return MessageResponse(message="Logged out successfully")


class RefreshTokenRequest(BaseModel):
    refresh_token: str


@router.post("/refresh", response_model=Token)
def refresh_token(
    request: Request,
    payload: RefreshTokenRequest,
    db: Session = Depends(get_db),
):
    token = payload.refresh_token
    payload_data = decode_token(token)
    if payload_data is None or payload_data.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    session = (
        db.query(UserSession)
        .filter(
            UserSession.refresh_token == token,
            UserSession.is_revoked == False,
        )
        .first()
    )
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token revoked or not found",
        )

    if session.expires_at < datetime.utcnow():
        session.is_revoked = True
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired",
        )

    user_id = payload_data.get("sub")
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    session.is_revoked = True

    new_access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email, "role": user.role.value}
    )
    new_refresh_token = create_refresh_token(
        data={"sub": str(user.id), "email": user.email, "role": user.role.value}
    )

    new_session = UserSession(
        user_id=user.id,
        refresh_token=new_refresh_token,
        ip_address=_get_client_ip(request),
        user_agent=request.headers.get("user-agent", "")[:500],
        expires_at=datetime.utcnow()
        + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(new_session)
    db.commit()

    return Token(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
    )





@router.get("/me", response_model=UserResponse)
def get_me(
    current_user: User = Depends(get_current_active_user),
):
    return current_user
