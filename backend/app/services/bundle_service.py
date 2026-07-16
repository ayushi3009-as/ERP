"""
Bundle lifecycle actions: split, merge, transfer, hold, reject, rework, close.

All business logic lives here per the "controllers validate, call service,
return response" rule — production.py's endpoints for these actions do
nothing but auth/fetch/delegate/respond.
"""

from typing import Optional, List
from decimal import Decimal
from datetime import datetime
from sqlalchemy.orm import Session

from app.models.models import (
    Bundle,
    BundleStatus,
    BundleHold,
    BundleReject,
    BundleRework,
    BundleMergeLog,
    BundleTransferLog,
    Machine,
    Employee,
    Department,
    Factory,
    Lot,
)
from app.services import barcode_service, realtime_service


class BundleActionError(ValueError):
    """Raised for any bundle-lifecycle validation failure — endpoints turn
    this into a 400, same pattern as ScanError/fabric_roll_service."""


TERMINAL_STATUSES = (BundleStatus.CLOSED,)


def _generate_bundle_number(db: Session, tenant, prefix: str = "BNDL") -> str:
    from app.models.models import NumberSeries

    series = (
        db.query(NumberSeries)
        .filter(NumberSeries.module == "bundle", NumberSeries.factory_id == tenant.factory_id)
        .first()
    )
    if not series:
        series = NumberSeries(
            company_id=tenant.company_id,
            factory_id=tenant.factory_id,
            series_name="Bundle",
            prefix=prefix,
            current_number=0,
            pad_length=5,
            module="bundle",
        )
        db.add(series)
        db.flush()
    series.current_number += 1
    number = f"{series.prefix}{str(series.current_number).zfill(series.pad_length)}"
    db.flush()
    return number


def split_bundle(
    db: Session,
    tenant,
    bundle: Bundle,
    split_quantity: float,
    actor_user_id: int,
    remarks: Optional[str] = None,
) -> Bundle:
    if bundle.status in TERMINAL_STATUSES:
        raise BundleActionError(f"Cannot split a bundle with status '{bundle.status.value}'")
    split_qty = Decimal(str(split_quantity))
    if split_qty <= 0:
        raise BundleActionError("split_quantity must be positive")
    if split_qty >= bundle.quantity:
        raise BundleActionError(
            "split_quantity must be less than the bundle's current quantity "
            "(splitting off everything is just a transfer, not a split)"
        )

    child = Bundle(
        company_id=tenant.company_id,
        factory_id=tenant.factory_id,
        bundle_number=_generate_bundle_number(db, tenant),
        production_order_id=bundle.production_order_id,
        lot_id=bundle.lot_id,
        lot_size_breakdown_id=bundle.lot_size_breakdown_id,
        parent_bundle_id=bundle.id,
        color_id=bundle.color_id,
        size_id=bundle.size_id,
        quantity=split_qty,
        current_stage=bundle.current_stage,
        status=bundle.status,
        remarks=remarks or f"Split from bundle {bundle.bundle_number}",
        created_by=actor_user_id,
    )
    db.add(child)
    bundle.quantity = bundle.quantity - split_qty
    db.flush()

    child.barcode_value, child.qr_value = barcode_service.generate_for(
        "bundle", child.bundle_number, child.id
    )

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="bundle_split", entity_type="bundle", entity_id=bundle.id,
        payload={"child_bundle_id": child.id, "split_quantity": float(split_qty)},
    )
    return child


def merge_bundles(
    db: Session,
    tenant,
    source_bundles: List[Bundle],
    actor_user_id: int,
    remarks: Optional[str] = None,
) -> Bundle:
    if len(source_bundles) < 2:
        raise BundleActionError("At least two bundles are required to merge")

    first = source_bundles[0]
    for b in source_bundles[1:]:
        if b.lot_id != first.lot_id or b.color_id != first.color_id or b.size_id != first.size_id:
            raise BundleActionError(
                "Only bundles from the same lot/color/size can be merged"
            )
        if b.current_stage != first.current_stage:
            raise BundleActionError(
                "Only bundles currently at the same production stage can be merged"
            )
    for b in source_bundles:
        if b.status in TERMINAL_STATUSES:
            raise BundleActionError(
                f"Bundle {b.bundle_number} has status '{b.status.value}' and cannot be merged"
            )

    total_qty = sum((b.quantity for b in source_bundles), Decimal("0"))

    result = Bundle(
        company_id=tenant.company_id,
        factory_id=tenant.factory_id,
        bundle_number=_generate_bundle_number(db, tenant),
        production_order_id=first.production_order_id,
        lot_id=first.lot_id,
        lot_size_breakdown_id=first.lot_size_breakdown_id,
        color_id=first.color_id,
        size_id=first.size_id,
        quantity=total_qty,
        current_stage=first.current_stage,
        status=first.status,
        remarks=remarks or f"Merged from {len(source_bundles)} bundles",
        created_by=actor_user_id,
    )
    db.add(result)
    db.flush()

    result.barcode_value, result.qr_value = barcode_service.generate_for(
        "bundle", result.bundle_number, result.id
    )

    source_ids = [b.id for b in source_bundles]
    for b in source_bundles:
        b.is_deleted = True
        b.remarks = (b.remarks or "") + f"\n[Merged into {result.bundle_number}]"

    merge_log = BundleMergeLog(
        result_bundle_id=result.id,
        source_bundle_ids=source_ids,
        merged_by=actor_user_id,
        remarks=remarks,
    )
    db.add(merge_log)

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="bundles_merged", entity_type="bundle", entity_id=result.id,
        payload={"source_bundle_ids": source_ids, "total_quantity": float(total_qty)},
    )
    return result


def transfer_bundle(
    db: Session,
    tenant,
    bundle: Bundle,
    transfer_type: str,
    to_value: int,
    actor_user_id: int,
    reason: Optional[str] = None,
) -> BundleTransferLog:
    if transfer_type not in ("employee", "machine", "department", "factory"):
        raise BundleActionError("transfer_type must be employee, machine, department, or factory")
    if bundle.status in TERMINAL_STATUSES:
        raise BundleActionError(f"Cannot transfer a bundle with status '{bundle.status.value}'")

    from_value = None
    if transfer_type == "employee":
        emp = db.query(Employee).filter(Employee.id == to_value, Employee.is_deleted == False).first()
        if not emp:
            raise BundleActionError("Destination employee not found")
        from_value = str(bundle.current_employee_id) if bundle.current_employee_id else None
        bundle.current_employee_id = to_value
    elif transfer_type == "machine":
        mac = db.query(Machine).filter(Machine.id == to_value, Machine.is_deleted == False).first()
        if not mac:
            raise BundleActionError("Destination machine not found")
        from_value = str(bundle.current_machine_id) if bundle.current_machine_id else None
        bundle.current_machine_id = to_value
        bundle.current_department_id = mac.department_id
    elif transfer_type == "department":
        dept = db.query(Department).filter(Department.id == to_value, Department.is_deleted == False).first()
        if not dept:
            raise BundleActionError("Destination department not found")
        from_value = str(bundle.current_department_id) if bundle.current_department_id else None
        bundle.current_department_id = to_value
    elif transfer_type == "factory":
        factory = db.query(Factory).filter(Factory.id == to_value, Factory.is_deleted == False).first()
        if not factory:
            raise BundleActionError("Destination factory not found")
        if factory.company_id != tenant.company_id:
            raise BundleActionError("Cannot transfer a bundle across companies")
        from_value = str(bundle.factory_id)
        bundle.factory_id = to_value

    log = BundleTransferLog(
        bundle_id=bundle.id,
        transfer_type=transfer_type,
        from_value=from_value,
        to_value=str(to_value),
        transferred_by=actor_user_id,
        reason=reason,
    )
    db.add(log)

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="bundle_transferred", entity_type="bundle", entity_id=bundle.id,
        payload={"transfer_type": transfer_type, "to_value": to_value},
    )
    return log


def hold_bundle(
    db: Session, tenant, bundle: Bundle, reason: str, actor_user_id: int
) -> BundleHold:
    if bundle.status == BundleStatus.ON_HOLD:
        raise BundleActionError("Bundle is already on hold")
    if bundle.status in TERMINAL_STATUSES:
        raise BundleActionError(f"Cannot hold a bundle with status '{bundle.status.value}'")

    hold = BundleHold(bundle_id=bundle.id, reason=reason, held_by=actor_user_id)
    db.add(hold)
    bundle.status = BundleStatus.ON_HOLD

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="bundle_held", entity_type="bundle", entity_id=bundle.id,
        payload={"reason": reason},
    )
    return hold


def resume_bundle(db: Session, tenant, bundle: Bundle, actor_user_id: int) -> BundleHold:
    if bundle.status != BundleStatus.ON_HOLD:
        raise BundleActionError("Bundle is not currently on hold")

    open_hold = (
        db.query(BundleHold)
        .filter(BundleHold.bundle_id == bundle.id, BundleHold.resumed_at.is_(None))
        .order_by(BundleHold.held_at.desc())
        .first()
    )
    if open_hold:
        open_hold.resumed_at = datetime.utcnow()
        open_hold.resumed_by = actor_user_id

    from app.models.models import ProductionStage
    if bundle.current_stage == ProductionStage.DISPATCH:
        bundle.status = BundleStatus.COMPLETED
    elif bundle.current_stage != ProductionStage.BUNDLE:
        bundle.status = BundleStatus.IN_PRODUCTION
    else:
        bundle.status = BundleStatus.CREATED

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="bundle_resumed", entity_type="bundle", entity_id=bundle.id,
        payload={"resumed_status": bundle.status.value},
    )
    return open_hold


def reject_bundle(
    db: Session,
    tenant,
    bundle: Bundle,
    reject_quantity: float,
    reason: str,
    actor_user_id: int,
    inspector_id: Optional[int] = None,
    qc_reference: Optional[str] = None,
) -> BundleReject:
    if bundle.status in TERMINAL_STATUSES:
        raise BundleActionError(f"Cannot reject a bundle with status '{bundle.status.value}'")
    qty = Decimal(str(reject_quantity))
    if qty <= 0 or qty > bundle.quantity:
        raise BundleActionError("reject_quantity must be positive and not exceed bundle quantity")

    rec = BundleReject(
        bundle_id=bundle.id,
        reject_quantity=qty,
        reason=reason,
        inspector_id=inspector_id,
        qc_reference=qc_reference,
        created_by=actor_user_id,
    )
    db.add(rec)
    bundle.status = BundleStatus.REJECTED

    if bundle.lot_id:
        lot = db.query(Lot).filter(Lot.id == bundle.lot_id).first()
        if lot:
            lot.reject_quantity = (lot.reject_quantity or 0) + int(qty)

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="bundle_rejected", entity_type="bundle", entity_id=bundle.id,
        payload={"reject_quantity": float(qty), "reason": reason},
    )
    return rec


def start_rework(
    db: Session,
    tenant,
    bundle: Bundle,
    reason: str,
    actor_user_id: int,
    employee_id: Optional[int] = None,
    machine_id: Optional[int] = None,
) -> BundleRework:
    if bundle.status == BundleStatus.CLOSED:
        raise BundleActionError("Cannot rework a closed bundle")

    rework = BundleRework(
        original_bundle_id=bundle.id,
        reason=reason,
        employee_id=employee_id,
        machine_id=machine_id,
        created_by=actor_user_id,
    )
    db.add(rework)
    bundle.status = BundleStatus.REWORK

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="bundle_rework_started", entity_type="bundle", entity_id=bundle.id,
        payload={"reason": reason},
    )
    return rework


def complete_rework(
    db: Session,
    tenant,
    rework: BundleRework,
    result: str,
    actor_user_id: int,
    duration_minutes: Optional[int] = None,
    remarks: Optional[str] = None,
) -> BundleRework:
    if result not in ("passed", "failed"):
        raise BundleActionError("result must be 'passed' or 'failed'")
    if rework.completed_at is not None:
        raise BundleActionError("This rework record is already completed")

    rework.completed_at = datetime.utcnow()
    rework.duration_minutes = duration_minutes
    rework.result = result
    rework.remarks = remarks

    bundle = db.query(Bundle).filter(Bundle.id == rework.original_bundle_id).first()
    if bundle:
        from app.models.models import ProductionStage
        if result == "passed":
            bundle.status = (
                BundleStatus.IN_PRODUCTION
                if bundle.current_stage != ProductionStage.BUNDLE
                else BundleStatus.CREATED
            )
        else:
            bundle.status = BundleStatus.REJECTED

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="bundle_rework_completed",
        entity_type="bundle",
        entity_id=rework.original_bundle_id,
        payload={"result": result},
    )
    return rework


def close_bundle(db: Session, tenant, bundle: Bundle, actor_user_id: int) -> Bundle:
    from app.models.models import ProductionStage

    if bundle.status != BundleStatus.COMPLETED:
        raise BundleActionError(
            "Bundle must be COMPLETED (dispatched, no pending operations) before it can be closed"
        )
    if bundle.current_stage != ProductionStage.DISPATCH:
        raise BundleActionError("Bundle has not reached the dispatch stage yet")

    bundle.status = BundleStatus.CLOSED

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="bundle_closed", entity_type="bundle", entity_id=bundle.id,
    )
    return bundle
