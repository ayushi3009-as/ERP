from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, datetime

from app.api.deps import get_db, get_current_user
from app.models.models import User, Attendance
from app.schemas.schemas import AttendanceResponse, PaginatedResponse, ScanRequest

router = APIRouter()

@router.get("/", response_model=PaginatedResponse[AttendanceResponse])
def get_attendance(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    target_date: date = None,
    skip: int = 0,
    limit: int = 100
):
    if not target_date:
        target_date = date.today()
        
    query = db.query(Attendance).filter(
        Attendance.company_id == current_user.company_id,
        Attendance.factory_id == current_user.factory_id,
        Attendance.date == target_date
    )
    total = query.count()
    records = query.order_by(Attendance.created_at.desc()).offset(skip).limit(limit).all()
    
    return {
        "items": records,
        "total": total,
        "page": (skip // limit) + 1 if limit > 0 else 1,
        "page_size": limit,
        "total_pages": (total + limit - 1) // limit if limit > 0 else 1
    }

@router.post("/scan")
def scan_attendance(
    scan: ScanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Find employee by barcode
    employee = db.query(User).filter(
        User.company_id == current_user.company_id,
        User.factory_id == current_user.factory_id,
        User.barcode == scan.barcode
    ).first()
    
    if not employee:
        raise HTTPException(status_code=404, detail="Invalid Employee Barcode")
        
    today = date.today()
    
    # Check if already marked today
    existing = db.query(Attendance).filter(
        Attendance.employee_id == employee.id,
        Attendance.date == today
    ).first()
    
    if existing:
        return {
            "success": True, 
            "message": f"Attendance already marked for {employee.full_name}",
            "employee": employee.full_name,
            "status": existing.status
        }
        
    # Mark present
    attendance = Attendance(
        employee_id=employee.id,
        date=today,
        status="PRESENT",
        scan_type="BARCODE",
        company_id=current_user.company_id,
        factory_id=current_user.factory_id
    )
    db.add(attendance)
    db.commit()
    
    return {
        "success": True,
        "message": f"Successfully checked in {employee.full_name}",
        "employee": employee.full_name,
        "status": "PRESENT"
    }
