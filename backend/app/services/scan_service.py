"""
Single entry point for the barcode scan workflow (module 6).

POST /production/scan calls process_scan() and nothing else — this is
deliberately not eleven separate "advance to cutting" / "advance to
stitching" endpoints. Scanning a bundle's barcode:
  1. resolves which entity the barcode belongs to
  2. (for a bundle) validates it isn't already at the final stage
  3. resolves the piece-rate for the operation being completed
  4. writes one BundleScanEvent (the payroll source of truth)
  5. advances Bundle.current_stage
  6. upserts the WIPLedger row for that bundle
  7. emits a realtime event
"""

from typing import Optional
from decimal import Decimal
from datetime import datetime
from sqlalchemy.orm import Session

from app.models.models import (
    Bundle,
    BundleScanEvent,
    BundleStatus,
    WIPLedger,
    Employee,
    Machine,
    MachineStatus,
    ProductionStage,
)
from app.services import barcode_service, rate_service, stage_service, realtime_service


class ScanError(ValueError):
    """Raised for any scan-workflow validation failure — the endpoint
    catches this and turns it into a 400, same pattern as fabric_roll_service."""


def _upsert_wip(
    db: Session,
    tenant: "TenantContext",  # noqa: F821
    bundle: Bundle,
    employee_id: Optional[int],
    machine_id: Optional[int],
):
    wip = db.query(WIPLedger).filter(WIPLedger.bundle_id == bundle.id).first()
    if not wip:
        wip = WIPLedger(
            company_id=tenant.company_id,
            factory_id=tenant.factory_id,
            bundle_id=bundle.id,
        )
        db.add(wip)
    wip.current_holder_employee_id = employee_id
    wip.current_stage = bundle.current_stage.value if bundle.current_stage else None
    wip.current_machine_id = machine_id

    # Bundle's own denormalized "where is it" columns — same writer, same
    # transaction as WIPLedger above, not a second source of truth.
    bundle.current_employee_id = employee_id
    bundle.current_machine_id = machine_id
    if machine_id:
        machine = db.query(Machine).filter(Machine.id == machine_id).first()
        bundle.current_department_id = machine.department_id if machine else None
    wip.last_event_at = datetime.utcnow()
    return wip


def process_scan(
    db: Session,
    tenant: "TenantContext",  # noqa: F821
    barcode_value: str,
    employee_id: int,
    machine_id: Optional[int] = None,
    operation_id: Optional[int] = None,
    quantity: Optional[float] = None,
    device_source: str = "usb",
    remarks: Optional[str] = None,
) -> dict:
    entity_type = barcode_service.resolve_prefix(barcode_value)

    if entity_type != "bundle":
        # Non-bundle barcodes (fabric_roll, lot, employee, machine) resolve
        # for lookup/identification only — their own workflows (module 3's
        # issue/return, module 4's cutting lifecycle) already own the
        # actions that mutate those entities. Scanning them here just
        # confirms what the code refers to, matching how a factory floor
        # app would use one scanner across object types.
        return {"entity_type": entity_type, "barcode_value": barcode_value}

    bundle = (
        tenant.apply(db.query(Bundle), Bundle)
        .filter(Bundle.barcode_value == barcode_value, Bundle.is_deleted == False)
        .first()
    )
    if not bundle:
        raise ScanError(f"No bundle found for barcode '{barcode_value}'")

    employee = (
        tenant.apply(db.query(Employee), Employee)
        .filter(Employee.id == employee_id, Employee.is_deleted == False)
        .first()
    )
    if not employee:
        raise ScanError("Scanning employee not found")

    if machine_id is not None:
        machine = (
            tenant.apply(db.query(Machine), Machine)
            .filter(Machine.id == machine_id, Machine.is_deleted == False)
            .first()
        )
        if not machine:
            raise ScanError("Machine not found")

    current_stage = bundle.current_stage
    next_stage = stage_service.get_next_stage(current_stage)
    if not next_stage:
        raise ScanError(f"Bundle {bundle.bundle_number} is already at the final stage")

    from app.services import quality_service
    try:
        quality_service.check_gate_approval(db, tenant, bundle, next_stage)
    except quality_service.QualityCheckError as exc:
        raise ScanError(str(exc))

    scan_quantity = Decimal(str(quantity)) if quantity is not None else bundle.quantity

    style_id = None
    if bundle.production_order:
        style_id = bundle.production_order.style_id

    rate_applied = None
    amount_earned = Decimal("0")
    if operation_id is not None:
        rate = rate_service.resolve_rate(db, tenant, operation_id, style_id)
        if rate:
            rate_applied = rate.rate_amount
            amount_earned = scan_quantity * rate_applied

    scan_event = BundleScanEvent(
        company_id=tenant.company_id,
        factory_id=tenant.factory_id,
        bundle_id=bundle.id,
        operation_id=operation_id,
        employee_id=employee_id,
        machine_id=machine_id,
        from_stage=current_stage.value if current_stage else None,
        to_stage=next_stage.value,
        quantity=scan_quantity,
        rate_applied=rate_applied,
        amount_earned=amount_earned,
        device_source=device_source,
        remarks=remarks,
    )
    db.add(scan_event)
    db.flush()

    bundle.current_stage = next_stage
    if next_stage == ProductionStage.DISPATCH:
        bundle.status = BundleStatus.COMPLETED
    elif bundle.status == BundleStatus.CREATED:
        bundle.status = BundleStatus.IN_PRODUCTION
    # ON_HOLD / REJECTED / REWORK bundles shouldn't normally reach here —
    # those states are meant to be resolved via their own endpoints first
    # (release/rework-complete) before scanning resumes; if a scan does
    # come in against one, we still advance stage/WIP (the physical scan
    # happened) but leave the lifecycle status for bundle_service to reconcile.

    if bundle.lot_id:
        from app.models.models import Lot, LotStatus

        lot = db.query(Lot).filter(Lot.id == bundle.lot_id).first()
        if lot and lot.status == LotStatus.BUNDLES_GENERATED:
            lot.status = LotStatus.IN_PRODUCTION

    _upsert_wip(db, tenant, bundle, employee_id, machine_id)

    if machine_id is not None:
        machine = db.query(Machine).filter(Machine.id == machine_id).first()
        if machine and machine.status != MachineStatus.BREAKDOWN:
            machine.status = MachineStatus.RUNNING

    from app.services import employee_work_service
    employee_work_service.auto_complete_for_scan(db, tenant, bundle.id, employee_id)

    from app.services import payroll_service
    payroll_service.recalculate_draft_slip(db, tenant, employee_id)

    # Finished-goods stock posting on reaching FINISHED is intentionally
    # NOT done here: it needs a target warehouse_id, which is a Sales &
    # Dispatch (module 12) concern to supply, not something scan_service
    # should guess. Module 12 will call stock_service directly at that point.

    realtime_service.emit(
        db,
        tenant.company_id,
        tenant.factory_id,
        event_type="bundle_scanned",
        entity_type="bundle",
        entity_id=bundle.id,
        payload={
            "from_stage": current_stage.value if current_stage else None,
            "to_stage": next_stage.value,
            "employee_id": employee_id,
            "amount_earned": float(amount_earned),
        },
    )

    return {
        "entity_type": "bundle",
        "bundle_id": bundle.id,
        "bundle_number": bundle.bundle_number,
        "from_stage": current_stage.value if current_stage else None,
        "to_stage": next_stage.value,
        "quantity": float(scan_quantity),
        "rate_applied": float(rate_applied) if rate_applied else None,
        "amount_earned": float(amount_earned),
        "scan_event_id": scan_event.id,
    }
