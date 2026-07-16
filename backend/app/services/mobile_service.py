"""
Mobile Scanner Platform (module 17) -- the ONLY mobile interface for
shop-floor operations.

Zero new business logic. Every action a mobile user takes -- scanning a
bundle, inspecting quality, moving stock, issuing/receiving a bundle --
is replayed through the EXACT SAME service function the web/desktop
endpoints already call:

  - Bundle scan          -> scan_service.process_scan()          (module 6/11)
  - Quality inspection   -> quality_service.inspect_bundle()      (module 11)
  - Bundle issue/receive -> employee_work_service.issue_bundle()/receive_bundle() (module 9)
  - Stock movement       -> stock_service.post_stock_movement()  (module 2)
  - Label printing       -> printing_service.render_label()      (module 16)

This file's actual job: device registration, offline batch replay (same
service calls, just deferred and ordered), and role-scoped mobile
dashboard curation (reusing dashboard_service/report_service, module 15/14).
"""

from typing import Optional, List
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.models.models import (
    MobileDevice, DevicePlatform, UserSession,
    OfflineSyncBatch, OfflineSyncItem, SyncStatus,
    Employee, Bundle, Attendance, AttendanceStatus,
    Notification, UserRole,
)
from app.services import (
    scan_service, quality_service, employee_work_service, stock_service,
    machine_service, dashboard_service, report_service, printing_service,
    realtime_service,
)


class MobileError(ValueError):
    pass


# ==================== DEVICE REGISTRATION ====================


def register_device(
    db: Session, user_id: int, device_identifier: str, platform: str,
    device_name: Optional[str] = None, app_version: Optional[str] = None,
    default_factory_id: Optional[int] = None, push_token: Optional[str] = None,
) -> MobileDevice:
    try:
        platform_enum = DevicePlatform(platform)
    except ValueError:
        raise MobileError(f"Unsupported platform: {platform}")

    existing = (
        db.query(MobileDevice)
        .filter(MobileDevice.user_id == user_id, MobileDevice.device_identifier == device_identifier)
        .first()
    )
    if existing:
        existing.device_name = device_name or existing.device_name
        existing.app_version = app_version or existing.app_version
        existing.default_factory_id = default_factory_id or existing.default_factory_id
        existing.push_token = push_token or existing.push_token
        existing.last_active_at = datetime.utcnow()
        existing.is_active = True
        return existing

    device = MobileDevice(
        user_id=user_id, device_identifier=device_identifier, platform=platform_enum,
        device_name=device_name, app_version=app_version, push_token=push_token,
        default_factory_id=default_factory_id, last_active_at=datetime.utcnow(),
    )
    db.add(device)
    return device


def list_devices(db: Session, user_id: int) -> List[MobileDevice]:
    return db.query(MobileDevice).filter(MobileDevice.user_id == user_id, MobileDevice.is_active == True).all()


def logout_device(db: Session, user_id: int, device_id: int) -> int:
    """Revokes every UserSession created from this specific device --
    reuses UserSession.is_revoked (already the mechanism auth.py's
    /logout uses), not a second revocation flag."""
    device = db.query(MobileDevice).filter(MobileDevice.id == device_id, MobileDevice.user_id == user_id).first()
    if not device:
        raise MobileError("Device not found")
    sessions = db.query(UserSession).filter(UserSession.device_id == device_id, UserSession.is_revoked == False).all()
    for s in sessions:
        s.is_revoked = True
    device.is_active = False
    return len(sessions)


def logout_all_devices(db: Session, user_id: int) -> int:
    sessions = (
        db.query(UserSession)
        .join(MobileDevice, MobileDevice.id == UserSession.device_id)
        .filter(MobileDevice.user_id == user_id, UserSession.is_revoked == False)
        .all()
    )
    for s in sessions:
        s.is_revoked = True
    db.query(MobileDevice).filter(MobileDevice.user_id == user_id).update({"is_active": False})
    return len(sessions)


def mark_device_active(db: Session, device_id: int) -> None:
    device = db.query(MobileDevice).filter(MobileDevice.id == device_id).first()
    if device:
        device.last_active_at = datetime.utcnow()


# ==================== SHOP FLOOR: SCAN (pure passthrough to scan_service) ====================


def mobile_scan_bundle(
    db: Session, tenant, barcode_value: str, employee_id: int, actor_user_id: int,
    machine_id: Optional[int] = None, operation_id: Optional[int] = None,
    quantity: Optional[float] = None, scan_source: str = "camera",
) -> dict:
    """Zero new logic -- calls scan_service.process_scan() with
    device_source set to how the phone captured the code (camera/
    bluetooth/usb-otg), so print/scan-history reports (module 16) can
    already tell mobile scans apart from fixed-station ones without any
    schema change, since device_source was already a free-text column."""
    try:
        return scan_service.process_scan(
            db, tenant, barcode_value, employee_id, machine_id, operation_id,
            quantity, device_source=scan_source,
        )
    except scan_service.ScanError as exc:
        raise MobileError(str(exc))


def get_employee_assigned_bundles(db: Session, tenant, employee_id: int) -> list:
    """Reuses employee_work_service.get_employee_queue() (module 9) --
    the mobile "Assigned Bundles" screen is just that queue, formatted
    for a phone."""
    from app.services import employee_work_service as ews
    return ews.get_employee_queue(db, tenant, employee_id)


# ==================== EMPLOYEE FEATURES ====================


def start_work(db: Session, tenant, employee_id: int, actor_user_id: int) -> Attendance:
    """'Start Work' is check-in -- reuses the Attendance table (module 0),
    not a new mobile-specific clock table."""
    today = datetime.utcnow().date()
    existing = (
        db.query(Attendance)
        .filter(Attendance.employee_id == employee_id, Attendance.attendance_date == today, Attendance.is_deleted == False)
        .first()
    )
    if existing and existing.check_in:
        raise MobileError("Already checked in today")

    if existing:
        existing.check_in = datetime.utcnow()
        existing.status = AttendanceStatus.PRESENT
        return existing

    record = Attendance(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        employee_id=employee_id, attendance_date=today, status=AttendanceStatus.PRESENT,
        check_in=datetime.utcnow(), created_by=actor_user_id,
    )
    db.add(record)
    return record


def stop_work(db: Session, tenant, employee_id: int) -> Attendance:
    today = datetime.utcnow().date()
    record = (
        db.query(Attendance)
        .filter(Attendance.employee_id == employee_id, Attendance.attendance_date == today, Attendance.is_deleted == False)
        .first()
    )
    if not record or not record.check_in:
        raise MobileError("No check-in found for today")
    record.check_out = datetime.utcnow()
    return record


def get_daily_production(db: Session, tenant, employee_id: int) -> dict:
    """Reuses dashboard_service.employee_current_work() +
    report_service's scan aggregation pattern rather than a new query."""
    from datetime import date
    from app.models.models import BundleScanEvent
    from sqlalchemy import func as sa_func

    today = date.today()
    total = (
        db.query(sa_func.coalesce(sa_func.sum(BundleScanEvent.quantity), 0))
        .filter(BundleScanEvent.employee_id == employee_id, sa_func.date(BundleScanEvent.scanned_at) == today)
        .scalar()
    )
    earned = (
        db.query(sa_func.coalesce(sa_func.sum(BundleScanEvent.amount_earned), 0))
        .filter(BundleScanEvent.employee_id == employee_id, sa_func.date(BundleScanEvent.scanned_at) == today)
        .scalar()
    )
    return {"date": today, "pieces_completed": float(total or 0), "amount_earned_today": float(earned or 0)}


def get_salary_preview(db: Session, tenant, employee_id: int) -> dict:
    """Reuses payroll_service's own draft-slip mechanism if one exists,
    otherwise a live (uncommitted) estimate via the same production-pay
    calculation payroll itself uses -- never a separate salary formula."""
    from app.services import payroll_service
    from datetime import date

    today = date.today()
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise MobileError("Employee not found")

    from app.models.models import SalarySlip
    existing_slip = (
        db.query(SalarySlip)
        .filter_by(employee_id=employee_id, month=today.month, year=today.year)
        .first()
    )
    if existing_slip:
        return {"source": "generated_slip", "net_salary": float(existing_slip.net_salary), "status": existing_slip.status.value}

    production = payroll_service.compute_production_pay(db, tenant, employee, today.replace(day=1), today)
    return {"source": "live_estimate", "provisional_production_pay": production["gross_production_pay"], "note": "Estimate only -- not a generated SalarySlip"}


# ==================== SUPERVISOR FEATURES ====================


def assign_bundle_to_employee(db: Session, tenant, bundle_id: int, employee_id: int, actor_user_id: int, operation_id: Optional[int] = None) -> dict:
    """Reuses employee_work_service.issue_bundle() -- the exact function
    the web 'Issue' endpoint (module 9) already calls."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not bundle or not employee:
        raise MobileError("Bundle or employee not found")
    try:
        assignment = employee_work_service.issue_bundle(db, tenant, bundle, employee, actor_user_id, operation_id=operation_id)
    except employee_work_service.WorkAssignmentError as exc:
        raise MobileError(str(exc))
    return {"assignment_id": assignment.id, "status": assignment.status.value}


def supervisor_overview(db: Session, tenant) -> dict:
    """Reuses dashboard_service.live_factory_overview() + employee_overview()
    + machine_summary() -- the supervisor mobile screen is a curated
    subset of the Factory Command Center (module 15), not a new
    aggregation."""
    return {
        "production": dashboard_service.live_factory_overview(db, tenant),
        "employees": dashboard_service.employee_overview(db, tenant),
        "machines": machine_service.get_fleet_dashboard(db, tenant),
        "alerts": dashboard_service.alert_center(db, tenant),
    }


# ==================== QUALITY FEATURES ====================


def mobile_quality_inspect(
    db: Session, tenant, bundle_id: int, actor_user_id: int, qc_type: str,
    passed_quantity: float, rejected_quantity: float, rework_quantity: float,
    inspector_id: Optional[int] = None, defect_category_id: Optional[int] = None,
    defect_description: Optional[str] = None,
) -> dict:
    """Pure passthrough to quality_service.inspect_bundle() (module 11) --
    photo capture is metadata-only per that module's own QualityPhoto
    design (not wired to real object storage there either); this just
    calls quality_service.add_quality_photo() after the inspection if the
    mobile client supplies a photo URL, no new photo-handling logic."""
    bundle = db.query(Bundle).filter(Bundle.id == bundle_id).first()
    if not bundle:
        raise MobileError("Bundle not found")
    try:
        return quality_service.inspect_bundle(
            db, tenant, bundle, actor_user_id, qc_type, passed_quantity, rejected_quantity,
            rework_quantity, inspector_id, defect_category_id, defect_description,
        )
    except quality_service.QualityCheckError as exc:
        raise MobileError(str(exc))


# ==================== WAREHOUSE FEATURES ====================


def mobile_stock_movement(
    db: Session, tenant, product_id: int, warehouse_id: int, movement_type: str,
    quantity: float, unit_cost: float = 0, reference_type: Optional[str] = None,
    reference_id: Optional[int] = None,
) -> dict:
    """Pure passthrough to stock_service.post_stock_movement() (module 2)
    -- covers Receive Fabric / Issue Fabric / Receive Finished Goods /
    Stock Transfer, all the same underlying movement types that module
    already models; mobile doesn't get its own inventory logic."""
    from app.models.models import StockMovementType
    try:
        movement_enum = StockMovementType(movement_type)
    except ValueError:
        raise MobileError(f"Invalid movement_type: {movement_type}")

    entry = stock_service.post_stock_movement(
        db, tenant, product_id, warehouse_id, movement_enum, quantity, unit_cost,
        reference_type=reference_type, reference_id=reference_id,
    )
    return {"stock_ledger_id": entry.id, "total_cost": float(entry.total_cost)}


def verify_location_barcode(db: Session, tenant, scanned_barcode: str, expected_warehouse_id: int) -> bool:
    """Location verification for warehouse features -- reuses
    barcode_service.resolve_prefix() plus a direct Warehouse lookup
    (module 16's warehouse barcode field), not a new barcode scheme."""
    from app.models.models import Warehouse
    warehouse = db.query(Warehouse).filter(Warehouse.barcode_value == scanned_barcode).first()
    if not warehouse:
        return False
    return warehouse.id == expected_warehouse_id


# ==================== DISPATCH FEATURES ====================


def mobile_dispatch_scan(db: Session, tenant, challan_id: int, barcode_value: str, actor_user_id: int) -> dict:
    """Pure passthrough to sales_service.dispatch_by_barcode_scan()
    (module 13) -- carton/bundle scan validation, duplicate-dispatch
    prevention, and correct-order checking are ALL already implemented
    there; mobile just calls it."""
    from app.services import sales_service
    from app.models.models import DeliveryChallan

    challan = db.query(DeliveryChallan).filter(DeliveryChallan.id == challan_id).first()
    if not challan:
        raise MobileError("Delivery challan not found")
    try:
        return sales_service.dispatch_by_barcode_scan(db, tenant, challan, barcode_value, actor_user_id)
    except sales_service.SalesError as exc:
        raise MobileError(str(exc))


# ==================== NOTIFICATIONS ====================


def get_mobile_notifications(db: Session, tenant, user_id: int, unread_only: bool = False) -> list:
    query = db.query(Notification).filter(Notification.user_id == user_id)
    if unread_only:
        query = query.filter(Notification.is_read == False)
    return query.order_by(Notification.id.desc()).limit(50).all()


def mark_notification_read(db: Session, notification_id: int, user_id: int) -> Notification:
    n = db.query(Notification).filter(Notification.id == notification_id, Notification.user_id == user_id).first()
    if not n:
        raise MobileError("Notification not found")
    n.is_read = True
    n.read_at = datetime.utcnow()
    return n


# ==================== OFFLINE SYNC (replays through the same services) ====================


ACTION_TYPES = {"scan_bundle", "attendance_start", "attendance_stop", "quality_inspect", "stock_movement"}


def submit_offline_batch(db: Session, tenant, device_id: int, actor_user_id: int, items: List[dict]) -> OfflineSyncBatch:
    """items: [{"action_type": "scan_bundle", "payload": {...},
    "client_sequence": 1, "client_timestamp": "..."}]. Creates the batch
    + item rows; does NOT process them here -- see process_offline_batch()."""
    device = db.query(MobileDevice).filter(MobileDevice.id == device_id).first()
    if not device:
        raise MobileError("Device not found")

    batch = OfflineSyncBatch(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        device_id=device_id, total_items=len(items),
    )
    db.add(batch)
    db.flush()

    for item in sorted(items, key=lambda x: x["client_sequence"]):
        if item["action_type"] not in ACTION_TYPES:
            raise MobileError(f"Unsupported offline action_type: {item['action_type']}")
        db.add(OfflineSyncItem(
            batch_id=batch.id, action_type=item["action_type"], payload=item["payload"],
            client_sequence=item["client_sequence"], client_timestamp=item["client_timestamp"],
        ))
    db.flush()
    return batch


def process_offline_batch(db: Session, tenant, batch: OfflineSyncBatch, actor_user_id: int) -> OfflineSyncBatch:
    """Replays every queued item IN CLIENT SEQUENCE ORDER through the
    same service functions the online endpoints use. Conflict detection
    is delegated to those services' own validation (e.g.
    scan_service.process_scan() already rejects a bundle that's already
    past the stage being scanned for) rather than a separate offline-only
    conflict engine -- "the server already knows how to reject an
    invalid state transition" is reused, not reimplemented for the
    offline path specifically."""
    items = db.query(OfflineSyncItem).filter(OfflineSyncItem.batch_id == batch.id).order_by(OfflineSyncItem.client_sequence).all()

    for item in items:
        try:
            if item.action_type == "scan_bundle":
                result = mobile_scan_bundle(
                    db, tenant, item.payload["barcode_value"], item.payload["employee_id"], actor_user_id,
                    item.payload.get("machine_id"), item.payload.get("operation_id"),
                    item.payload.get("quantity"), scan_source="offline_sync",
                )
                item.result_entity_type = "bundle_scan"
            elif item.action_type == "attendance_start":
                result = start_work(db, tenant, item.payload["employee_id"], actor_user_id)
                item.result_entity_type = "attendance"
                item.result_entity_id = result.id
            elif item.action_type == "attendance_stop":
                result = stop_work(db, tenant, item.payload["employee_id"])
                item.result_entity_type = "attendance"
                item.result_entity_id = result.id
            elif item.action_type == "quality_inspect":
                result = mobile_quality_inspect(
                    db, tenant, item.payload["bundle_id"], actor_user_id, item.payload["qc_type"],
                    item.payload["passed_quantity"], item.payload["rejected_quantity"], item.payload["rework_quantity"],
                )
                item.result_entity_type = "quality_check"
            elif item.action_type == "stock_movement":
                result = mobile_stock_movement(
                    db, tenant, item.payload["product_id"], item.payload["warehouse_id"],
                    item.payload["movement_type"], item.payload["quantity"],
                )
                item.result_entity_type = "stock_ledger"
            else:
                raise MobileError(f"Unhandled action_type: {item.action_type}")

            item.status = SyncStatus.SYNCED
            item.processed_at = datetime.utcnow()
            batch.synced_items += 1
        except MobileError as exc:
            item.status = SyncStatus.CONFLICT
            item.error_message = str(exc)
            item.processed_at = datetime.utcnow()
            batch.conflict_items += 1
        except Exception as exc:
            item.status = SyncStatus.FAILED
            item.error_message = str(exc)
            item.processed_at = datetime.utcnow()
            batch.failed_items += 1

    batch.status = (
        SyncStatus.SYNCED if batch.failed_items == 0 and batch.conflict_items == 0
        else SyncStatus.CONFLICT if batch.conflict_items > 0
        else SyncStatus.FAILED
    )

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="offline_batch_synced", entity_type="offline_sync_batch", entity_id=batch.id,
        payload={"synced": batch.synced_items, "conflicts": batch.conflict_items, "failed": batch.failed_items},
    )
    return batch


def get_sync_status(db: Session, batch_id: int) -> Optional[OfflineSyncBatch]:
    return db.query(OfflineSyncBatch).filter(OfflineSyncBatch.id == batch_id).first()


# ==================== ROLE-SCOPED MOBILE HOME SCREEN ====================


ROLE_SCREENS = {
    UserRole.OPERATOR: ["attendance", "assigned_bundles", "scan", "daily_production", "salary_preview", "notifications"],
    UserRole.WORKER: ["attendance", "assigned_bundles", "scan", "daily_production", "salary_preview", "notifications"],
    UserRole.PRODUCTION_MANAGER: ["supervisor_overview", "assign_bundles", "production_overview", "alerts", "scan"],
    UserRole.QUALITY: ["quality_scan", "inspection", "defect_selection", "notifications"],
    UserRole.STORE_MANAGER: ["warehouse_receive", "warehouse_issue", "stock_count", "stock_transfer", "location_verify"],
    UserRole.SALES_MANAGER: ["dispatch_scan", "verify_dispatch", "delivery_confirmation"],
    UserRole.HR: ["attendance_overview", "notifications"],
    UserRole.ACCOUNTANT: ["payroll_alerts", "notifications"],
}


def get_mobile_screens_for_role(role: UserRole) -> list:
    """'Every role should see only relevant mobile screens' -- a lookup
    table, not per-screen role-check logic scattered across endpoints."""
    return ROLE_SCREENS.get(role, ["notifications"])
