from typing import Any
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.api.deps import get_db, get_current_user
from app.models.models import Lot, User, Attendance, Product, Design, InternalPayment, BarcodeScanHistory
from datetime import datetime

router = APIRouter()

@router.get("/production")
def get_production_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    date_from: str = None,
    date_to: str = None,
    search: str = ""
) -> Any:
    query = db.query(
        Lot.lot_number,
        Lot.size,
        Lot.quantity,
        Lot.current_process,
        Lot.created_at,
        Product.name.label("product_name"),
        Design.design_number.label("design_number"),
    ).outerjoin(Product, Lot.product_id == Product.id)\
     .outerjoin(Design, Lot.design_id == Design.id)\
     .filter(
        Lot.company_id == current_user.company_id,
        Lot.is_deleted == False
    )

    if search:
        query = query.filter(Lot.lot_number.ilike(f"%{search}%"))

    if date_from:
        try:
            df = datetime.fromisoformat(date_from)
            query = query.filter(Lot.created_at >= df)
        except ValueError:
            pass
    if date_to:
        try:
            dt = datetime.fromisoformat(date_to)
            query = query.filter(Lot.created_at <= dt)
        except ValueError:
            pass

    results = query.order_by(Lot.created_at.desc()).all()
    data = [
        {
            "lot_number": r.lot_number or "N/A",
            "product_name": r.product_name or "N/A",
            "design_number": r.design_number or "N/A",
            "size": r.size or "N/A",
            "quantity": r.quantity or 0,
            "current_process": r.current_process or "Pending",
            "status": "completed" if r.current_process == "dispatch" else "active",
            "created_at": r.created_at.isoformat() if r.created_at else None
        } for r in results
    ]
    return {"data": data, "total": len(data)}

@router.get("/attendance")
def get_attendance_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    date_from: str = None,
    date_to: str = None,
    search: str = ""
) -> Any:
    query = db.query(
        Attendance.date,
        Attendance.status,
        Attendance.shift,
        Attendance.scan_type,
        User.full_name.label("employee_name"),
        User.employee_id.label("employee_code"),
        User.role.label("department"),
    ).join(User, Attendance.employee_id == User.id).filter(
        Attendance.company_id == current_user.company_id
    )

    if search:
        query = query.filter(User.full_name.ilike(f"%{search}%"))

    if date_from:
        try:
            df = datetime.fromisoformat(date_from).date()
            query = query.filter(Attendance.date >= df)
        except ValueError:
            pass
    if date_to:
        try:
            dt = datetime.fromisoformat(date_to).date()
            query = query.filter(Attendance.date <= dt)
        except ValueError:
            pass

    results = query.order_by(Attendance.date.desc()).all()
    data = [
        {
            "date": r.date.isoformat() if r.date else None,
            "employee_name": r.employee_name or "N/A",
            "employee_id": r.employee_code or "N/A",
            "department": str(r.department or "N/A").replace("_", " ").title(),
            "status": r.status or "N/A",
            "shift": r.shift or "General",
            "scan_type": r.scan_type or "Manual",
        } for r in results
    ]
    return {"data": data, "total": len(data)}

@router.get("/scan-history")
def get_scan_history_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    search: str = ""
) -> Any:
    query = db.query(
        BarcodeScanHistory.created_at,
        BarcodeScanHistory.barcode,
        BarcodeScanHistory.scan_type,
        BarcodeScanHistory.process_stage,
        BarcodeScanHistory.remarks,
        User.full_name.label("scanned_by_name"),
    ).outerjoin(User, BarcodeScanHistory.scanned_by == User.id).filter(
        BarcodeScanHistory.company_id == current_user.company_id
    )

    if search:
        query = query.filter(BarcodeScanHistory.barcode.ilike(f"%{search}%"))

    results = query.order_by(BarcodeScanHistory.created_at.desc()).limit(500).all()
    data = [
        {
            "scanned_at": r.created_at.isoformat() if r.created_at else None,
            "barcode": r.barcode,
            "scan_type": r.scan_type or "N/A",
            "scanned_by_name": r.scanned_by_name or "System",
            "process_recorded": r.process_stage or "N/A",
            "remarks": r.remarks or "",
        } for r in results
    ]
    return {"data": data, "total": len(data)}

@router.get("/employee")
def get_employee_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    search: str = ""
) -> Any:
    query = db.query(
        User.employee_id,
        User.full_name.label("name"),
        User.role,
        User.phone,
        User.email,
        User.joined_date,
        User.is_active,
    ).filter(
        User.company_id == current_user.company_id,
        User.role.notin_(['super_admin', 'company_admin'])
    )

    if search:
        query = query.filter(User.full_name.ilike(f"%{search}%"))

    results = query.all()
    data = [
        {
            "employee_id": r.employee_id or "N/A",
            "name": r.name or "N/A",
            "department": str(r.role or "N/A").replace("_", " ").title(),
            "designation": r.phone or "N/A",
            "email": r.email or "N/A",
            "joined_date": r.joined_date.isoformat() if r.joined_date else None,
            "status": "active" if r.is_active else "inactive",
        } for r in results
    ]
    return {"data": data, "total": len(data)}

@router.get("/payments")
def get_payments_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    search: str = ""
) -> Any:
    query = db.query(
        InternalPayment.payment_date,
        InternalPayment.payment_id,
        InternalPayment.employee_name,
        InternalPayment.payment_type,
        InternalPayment.amount,
        InternalPayment.remarks,
    ).filter(InternalPayment.company_id == current_user.company_id)

    if search:
        query = query.filter(InternalPayment.employee_name.ilike(f"%{search}%"))

    results = query.order_by(InternalPayment.payment_date.desc()).all()
    data = [
        {
            "payment_date": r.payment_date.isoformat() if r.payment_date else None,
            "payment_id": r.payment_id,
            "employee_name": r.employee_name or "N/A",
            "payment_type": r.payment_type,
            "amount": float(r.amount) if r.amount else 0,
            "remarks": r.remarks or "",
        } for r in results
    ]
    return {"data": data, "total": len(data)}
