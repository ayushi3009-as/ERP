from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Any
from datetime import datetime, date

from app.core.database import get_db
from app.models.models import Lot, BarcodeScanHistory, ProductionStage, User, Attendance, Design, Product
from app.schemas.schemas import ScanRequest, ScanResponse
from app.api.deps import get_current_active_user

router = APIRouter()

# Fixed order of production stages for Garment Manufacturing
STAGE_SEQUENCE = [
    ProductionStage.PLANNING.value,
    ProductionStage.CUTTING.value,
    ProductionStage.BUNDLE.value,
    ProductionStage.PRINTING.value,
    ProductionStage.EMBROIDERY.value,
    ProductionStage.STITCHING.value,
    ProductionStage.CHECKING.value,
    ProductionStage.IRONING.value,
    ProductionStage.PACKING.value,
    ProductionStage.FINISHED.value,
    ProductionStage.DISPATCH.value
]

@router.post("/scan")
def smart_scan(
    *,
    db: Session = Depends(get_db),
    scan_in: ScanRequest,
    current_user: Any = Depends(get_current_active_user)
) -> Any:
    """
    Smart Barcode Scanner — handles both Lot barcodes and Employee barcodes.
    - Lot barcode → advances production stage, returns lot details
    - Employee barcode → marks/toggles attendance, returns employee details
    """
    barcode = scan_in.barcode.strip()
    if not barcode:
        raise HTTPException(status_code=400, detail="Barcode cannot be empty")

    from sqlalchemy import or_

    # --- Try LOT first ---
    lot = db.query(Lot).filter(
        or_(Lot.barcode == barcode, Lot.lot_number == barcode),
        Lot.is_deleted == False,
        Lot.company_id == current_user.company_id
    ).first()

    if lot:
        # Load design and product details
        design = db.query(Design).filter(Design.id == lot.design_id).first()
        product = db.query(Product).filter(Product.id == lot.product_id).first()

        current_stage = lot.current_process
        try:
            current_index = STAGE_SEQUENCE.index(current_stage) if current_stage else -1
            if current_index >= len(STAGE_SEQUENCE) - 1:
                next_stage = current_stage
                msg = f"Lot {lot.lot_number} is already fully completed."
                success = False
            else:
                next_stage = STAGE_SEQUENCE[current_index + 1]
                lot.current_process = next_stage
                msg = f"Lot advanced: {current_stage or 'Start'} → {next_stage}"
                success = True
        except ValueError:
            next_stage = ProductionStage.CUTTING.value
            lot.current_process = next_stage
            msg = f"Lot started at: {next_stage}"
            success = True

        # Record history
        history = BarcodeScanHistory(
            barcode=barcode,
            scan_type="lot",
            scanned_by=current_user.id,
            process_stage=next_stage,
            factory_id=lot.factory_id,
            company_id=lot.company_id,
            remarks=msg
        )
        db.add(history)
        db.commit()

        return {
            "success": success,
            "scan_type": "lot",
            "message": msg,
            "lot_number": lot.lot_number,
            "previous_stage": current_stage or "N/A",
            "new_stage": next_stage,
            "size": lot.size or "N/A",
            "quantity": lot.quantity or 0,
            "design_number": design.design_number if design else "N/A",
            "design_name": design.name if design else "N/A",
            "product_name": product.name if product else "N/A",
            "product_code": product.code if product else "N/A",
        }

    # --- Try EMPLOYEE barcode ---
    employee = db.query(User).filter(
        User.barcode == barcode,
        User.company_id == current_user.company_id,
    ).first()

    if employee:
        today = date.today()

        # Check existing attendance
        existing = db.query(Attendance).filter(
            Attendance.employee_id == employee.id,
            Attendance.date == today
        ).first()

        if existing:
            # Toggle: if PRESENT mark CHECK_OUT, if already CHECK_OUT mark back PRESENT
            if existing.status == "PRESENT":
                existing.status = "CHECK_OUT"
                att_status = "CHECK_OUT"
                msg = f"✅ {employee.full_name} checked OUT"
            else:
                existing.status = "PRESENT"
                att_status = "PRESENT"
                msg = f"✅ {employee.full_name} checked IN"
        else:
            # First scan of the day = check in
            new_att = Attendance(
                employee_id=employee.id,
                date=today,
                status="PRESENT",
                scan_type="BARCODE",
                company_id=employee.company_id,
                factory_id=employee.factory_id or current_user.factory_id
            )
            db.add(new_att)
            att_status = "PRESENT"
            msg = f"✅ {employee.full_name} checked IN"

        # Record history
        history = BarcodeScanHistory(
            barcode=barcode,
            scan_type="employee",
            scanned_by=current_user.id,
            process_stage=att_status,
            factory_id=current_user.factory_id,
            company_id=current_user.company_id,
            remarks=msg
        )
        db.add(history)
        db.commit()

        return {
            "success": True,
            "scan_type": "employee",
            "message": msg,
            "employee_name": employee.full_name,
            "employee_id": employee.employee_id or "N/A",
            "role": str(employee.role or "").replace("_", " ").title(),
            "department": str(employee.role or "").replace("_", " ").title(),
            "phone": employee.phone or "N/A",
            "attendance_status": att_status,
            "attendance_date": today.isoformat(),
        }

    # Not found
    history = BarcodeScanHistory(
        barcode=barcode,
        scan_type="unknown",
        scanned_by=current_user.id,
        process_stage=None,
        factory_id=current_user.factory_id,
        company_id=current_user.company_id,
        remarks="Barcode not recognized"
    )
    db.add(history)
    db.commit()

    return {
        "success": False,
        "scan_type": "unknown",
        "message": f"❌ Barcode '{barcode}' not found in system.",
    }
