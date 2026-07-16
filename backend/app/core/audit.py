import json
from datetime import datetime
from functools import wraps
from typing import Optional, Callable

from fastapi import Request
from sqlalchemy.orm import Session

from app.models.models import AuditLog


def create_audit_log(
    db: Session,
    user_id: Optional[int],
    action: str,
    module: str,
    record_id: Optional[int] = None,
    record_type: Optional[str] = None,
    old_values: Optional[dict] = None,
    new_values: Optional[dict] = None,
    request: Optional[Request] = None,
) -> AuditLog:
    ip_address = None
    user_agent = None
    if request:
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent", "")[:500]

    audit = AuditLog(
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
    db.add(audit)
    db.commit()
    db.refresh(audit)
    return audit


def audit_log(
    action: str,
    module: str,
    record_type: Optional[str] = None,
):
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            db: Optional[Session] = kwargs.get("db")
            request: Optional[Request] = kwargs.get("request")
            current_user = kwargs.get("current_user")

            user_id = current_user.id if current_user else None

            old_values = None
            record_id = kwargs.get("id") or kwargs.get("record_id")

            if action in ("update", "delete") and db and record_id:
                from sqlalchemy import inspect as sa_inspect

                model_map = {
                    "customer": "customers",
                    "vendor": "vendors",
                    "employee": "employees",
                    "product": "products",
                    "purchase_order": "purchase_orders",
                    "sales_order": "sales_orders",
                }
                table_name = model_map.get(record_type or module)
                if table_name:
                    from sqlalchemy import text

                    result = db.execute(
                        text(
                            f"SELECT row_to_json(t) FROM {table_name} t WHERE id = :id"
                        ),
                        {"id": record_id},
                    )
                    row = result.fetchone()
                    if row:
                        old_values = row[0] if isinstance(row[0], dict) else None

            result = await func(*args, **kwargs)

            new_values = None
            if action in ("create", "update") and hasattr(result, "__dict__"):
                new_values = {
                    k: v
                    for k, v in result.__dict__.items()
                    if not k.startswith("_")
                    and not isinstance(v, (datetime, type(None)))
                    or isinstance(v, (str, int, float, bool))
                }

            if db:
                create_audit_log(
                    db=db,
                    user_id=user_id,
                    action=action,
                    module=module,
                    record_id=record_id
                    or (getattr(result, "id", None) if hasattr(result, "id") else None),
                    record_type=record_type or module,
                    old_values=old_values,
                    new_values=new_values,
                    request=request,
                )

            return result

        return wrapper

    return decorator
