from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Any

from app.core.database import get_db
from app.models.models import Lot, Design, Product, Fabric, Category

router = APIRouter()

@router.get("/lot/{barcode}")
def get_public_lot_details(barcode: str, db: Session = Depends(get_db)) -> Any:
    """
    Public endpoint to fetch detailed Lot information for scanning via Google Lens / Camera QR
    without needing login.
    """
    lot = db.query(Lot).filter(Lot.barcode == barcode.strip(), Lot.is_deleted == False).first()
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")
        
    design = db.query(Design).filter(Design.id == lot.design_id).first()
    product = db.query(Product).filter(Product.id == lot.product_id).first()
    
    fabric_name = "N/A"
    category_name = "N/A"
    
    if product:
        if product.fabric_id:
            fabric = db.query(Fabric).filter(Fabric.id == product.fabric_id).first()
            if fabric:
                fabric_name = fabric.name
        if product.category_id:
            cat = db.query(Category).filter(Category.id == product.category_id).first()
            if cat:
                category_name = cat.name

    return {
        "success": True,
        "lot_number": lot.lot_number,
        "barcode": lot.barcode,
        "size": lot.size or "N/A",
        "quantity": lot.quantity or 0,
        "current_process": lot.current_process or "Planning",
        "design_number": design.design_number if design else "N/A",
        "design_name": design.name if design else "N/A",
        "product_name": product.name if product else "N/A",
        "product_code": product.code if product else "N/A",
        "fabric_name": fabric_name,
        "category_name": category_name,
        "created_at": lot.created_at.isoformat() if lot.created_at else None
    }

@router.get("/attendance/{barcode}")
def get_public_attendance_scan(barcode: str, db: Session = Depends(get_db)) -> Any:
    """
    Public QR Scanner endpoint for Employee Attendance.
    Scanning the QR marks the employee PRESENT for today instantly.
    """
    from app.models.models import User, Attendance, BarcodeScanHistory
    from datetime import date

    employee = db.query(User).filter(User.barcode == barcode.strip(), User.is_deleted == False).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee barcode not found")

    today = date.today()
    existing = db.query(Attendance).filter(
        Attendance.employee_id == employee.id,
        Attendance.date == today
    ).first()

    status_msg = ""
    if existing:
        if existing.status == "PRESENT":
            existing.status = "CHECK_OUT"
            status_msg = "CHECK_OUT"
            msg = f"Check-Out logged for {employee.full_name}"
        else:
            existing.status = "PRESENT"
            status_msg = "PRESENT"
            msg = f"Check-In logged for {employee.full_name}"
    else:
        new_att = Attendance(
            employee_id=employee.id,
            date=today,
            status="PRESENT",
            scan_type="BARCODE",
            company_id=employee.company_id,
            factory_id=employee.factory_id or 1
        )
        db.add(new_att)
        status_msg = "PRESENT"
        msg = f"Check-In logged for {employee.full_name}"

    # Record history
    history = BarcodeScanHistory(
        barcode=barcode,
        scan_type="employee",
        scanned_by=employee.id,
        process_stage=status_msg,
        factory_id=employee.factory_id or 1,
        company_id=employee.company_id,
        remarks=msg
    )
    db.add(history)
    db.commit()

    import json
    op_str = "Overlock"
    rate_val = 0
    total_pieces = 0
    completed_pieces = 0
    pending_pieces = 0
    damaged_pieces = 0

    if employee.avatar_url:
        try:
            parsed = json.loads(employee.avatar_url)
            op_str = parsed.get("operation") or parsed.get("department") or "Overlock"
            rate_val = parsed.get("rate") or 0
            total_pieces = parsed.get("total_pieces") or parsed.get("pieces_given") or 0
            completed_pieces = parsed.get("completed_pieces") or parsed.get("pieces_returned") or 0
            pending_pieces = parsed.get("pending_pieces") or max(0, total_pieces - completed_pieces)
            damaged_pieces = parsed.get("damaged_pieces") or 0
        except Exception:
            op_str = employee.avatar_url

    return {
        "success": True,
        "employee_name": employee.full_name,
        "employee_id": employee.employee_id or "N/A",
        "operation": op_str.replace("_", " ").title(),
        "rate": rate_val,
        "total_pieces": total_pieces,
        "completed_pieces": completed_pieces,
        "pending_pieces": pending_pieces,
        "damaged_pieces": damaged_pieces,
        "working_status": "Active in Production",
        "status": status_msg,
        "date": today.isoformat(),
        "message": msg
    }
