from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Any
from datetime import datetime

from app.core.database import get_db
from app.models.models import Lot, BarcodeScanHistory, ProductionStage
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

@router.post("/scan", response_model=ScanResponse)
def scan_barcode(
    *,
    db: Session = Depends(get_db),
    scan_in: ScanRequest,
    current_user: Any = Depends(get_current_active_user)
) -> Any:
    """
    Core Barcode Scanner Endpoint.
    Scans a barcode, identifies the lot, and advances its production stage.
    """
    barcode = scan_in.barcode.strip()
    if not barcode:
        raise HTTPException(status_code=400, detail="Barcode cannot be empty")
        
    from sqlalchemy import or_
    lot = db.query(Lot).filter(
        or_(Lot.barcode == barcode, Lot.lot_number == barcode),
        Lot.is_deleted == False,
        Lot.company_id == current_user.company_id
    ).first()
    
    if not lot:
        # Check if it's an employee barcode (for attendance or login)
        # For now we only handle Lot barcodes in this endpoint
        return ScanResponse(
            success=False, 
            message="Barcode not recognized as an active Lot.",
            lot_number=None,
            previous_stage=None,
            new_stage=None
        )
        
    current_stage = lot.current_process
    
    # Find next stage
    try:
        current_index = STAGE_SEQUENCE.index(current_stage)
        if current_index >= len(STAGE_SEQUENCE) - 1:
            return ScanResponse(
                success=False,
                message=f"Lot {lot.lot_number} is already fully completed ({current_stage}).",
                lot_number=lot.lot_number,
                previous_stage=current_stage,
                new_stage=current_stage
            )
        next_stage = STAGE_SEQUENCE[current_index + 1]
    except ValueError:
        # Unknown stage? Fallback to cutting
        next_stage = ProductionStage.CUTTING.value

    # Update lot
    lot.current_process = next_stage
    
    # Record history
    history = BarcodeScanHistory(
        barcode=lot.barcode,
        scan_type="lot",
        scanned_by=scan_in.employee_id or current_user.id,
        process_stage=next_stage,
        factory_id=lot.factory_id,
        company_id=lot.company_id,
        remarks=f"Advanced from {current_stage} to {next_stage}"
    )
    
    db.add(history)
    db.commit()
    
    return ScanResponse(
        success=True,
        message=f"Success: Lot moved to {next_stage.capitalize()}",
        lot_number=lot.lot_number,
        previous_stage=current_stage,
        new_stage=next_stage
    )
