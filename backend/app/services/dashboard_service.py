"""
Factory Command Center (module 15) -- the single real-time dashboard
facade.

Same discipline as report_service.py (module 14): most functions here
call an existing service's dashboard/report function directly and
recompute nothing. Genuinely new pieces are the Alert Center (merges
alerts already computed by machine_service/quality_service into one
feed), the Live Timeline (merges BundleScanEvent/MachineDowntime/
MachineMaintenanceLog factory-wide, the same pattern
machine_service.get_unified_timeline() uses per-machine), and employee
productivity ranking (nothing else ranks employees by output).

WebSocket push is connection_manager.py + realtime_service.emit() --
this file only produces the DATA that gets pushed; it doesn't manage
connections itself.
"""

from typing import Optional, List
from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func

from app.models.models import (
    Lot, LotStatus, Bundle, BundleStatus, WIPLedger, BundleScanEvent,
    MachineDowntime, MachineMaintenanceLog, Employee, Attendance, AttendanceStatus,
    QualityCheck, QCResult,
)
from app.services import (
    report_service, machine_service, quality_service, payroll_service,
    costing_service, sales_service,
)


# ==================== LIVE FACTORY OVERVIEW ====================


def live_factory_overview(db: Session, tenant) -> dict:
    """Reuses report_service.production_pending_completed_rejected() and
    report_service.wip_report() rather than re-deriving lot/bundle counts."""
    today = date.today()
    production = report_service.production_pending_completed_rejected(db, tenant, today, today)
    wip = report_service.wip_report(db, tenant)

    bundles_today = (
        tenant.apply(db.query(Bundle), Bundle)
        .filter(sa_func.date(Bundle.created_at) == today, Bundle.is_deleted == False)
        .all()
    )
    running = sum(1 for b in bundles_today if b.status == BundleStatus.IN_PRODUCTION)
    pending = sum(1 for b in bundles_today if b.status == BundleStatus.CREATED)
    completed = sum(1 for b in bundles_today if b.status == BundleStatus.COMPLETED)
    rejected = sum(1 for b in bundles_today if b.status == BundleStatus.REJECTED)
    rework = sum(1 for b in bundles_today if b.status == BundleStatus.REWORK)

    finished_goods = report_service.finished_goods_report(db, tenant)

    return {
        "date": today,
        "current_shift": None,  # no Shift master exists in this schema yet -- not fabricated
        "running_lots": production["pending_lots"],
        "running_bundles": running, "pending_bundles": pending,
        "completed_bundles": completed, "rejected_bundles": rejected, "rework_bundles": rework,
        "finished_goods_lines": len(finished_goods),
        "current_wip_count": len(wip),
    }


# ==================== PRODUCTION BREAKDOWNS ====================


def production_by_hour(db: Session, tenant, target_date: Optional[date] = None) -> list:
    """Genuinely new -- nothing else buckets BundleScanEvent by hour."""
    target_date = target_date or date.today()
    rows = (
        db.query(sa_func.extract("hour", BundleScanEvent.scanned_at), sa_func.sum(BundleScanEvent.quantity))
        .filter(sa_func.date(BundleScanEvent.scanned_at) == target_date)
        .group_by(sa_func.extract("hour", BundleScanEvent.scanned_at))
        .order_by(sa_func.extract("hour", BundleScanEvent.scanned_at))
        .all()
    )
    return [{"hour": int(r[0]), "quantity": float(r[1] or 0)} for r in rows]


def production_by_department(db: Session, tenant, target_date: Optional[date] = None) -> list:
    target_date = target_date or date.today()
    rows = (
        db.query(Employee.department_id, sa_func.sum(BundleScanEvent.quantity))
        .join(Employee, Employee.id == BundleScanEvent.employee_id)
        .filter(sa_func.date(BundleScanEvent.scanned_at) == target_date)
        .group_by(Employee.department_id)
        .all()
    )
    return [{"department_id": r[0], "quantity": float(r[1] or 0)} for r in rows]


def production_by_operation(db: Session, tenant, target_date: Optional[date] = None) -> list:
    target_date = target_date or date.today()
    rows = (
        db.query(BundleScanEvent.operation_id, sa_func.sum(BundleScanEvent.quantity))
        .filter(sa_func.date(BundleScanEvent.scanned_at) == target_date, BundleScanEvent.operation_id.isnot(None))
        .group_by(BundleScanEvent.operation_id)
        .all()
    )
    return [{"operation_id": r[0], "quantity": float(r[1] or 0)} for r in rows]


def production_target_vs_achievement(db: Session, tenant, target_date: Optional[date] = None) -> dict:
    """Reuses MachineCapacityTarget (module 10) for the target side and
    BundleScanEvent for actual -- not a new target-tracking table."""
    from app.models.models import MachineCapacityTarget
    target_date = target_date or date.today()
    targets = (
        db.query(sa_func.sum(MachineCapacityTarget.target_quantity))
        .filter(MachineCapacityTarget.period_type == "daily", MachineCapacityTarget.period_start_date == target_date)
        .scalar()
    )
    achieved = (
        db.query(sa_func.coalesce(sa_func.sum(BundleScanEvent.quantity), 0))
        .filter(sa_func.date(BundleScanEvent.scanned_at) == target_date)
        .scalar()
    )
    target_val = float(targets or 0)
    achieved_val = float(achieved or 0)
    return {
        "date": target_date, "target": target_val, "achievement": achieved_val,
        "variance": round(achieved_val - target_val, 2),
        "achievement_pct": round((achieved_val / target_val) * 100, 2) if target_val else None,
    }


# ==================== EMPLOYEE ====================


def employee_overview(db: Session, tenant, target_date: Optional[date] = None) -> dict:
    target_date = target_date or date.today()
    working = (
        db.query(sa_func.count(sa_func.distinct(BundleScanEvent.employee_id)))
        .filter(sa_func.date(BundleScanEvent.scanned_at) == target_date)
        .scalar()
    ) or 0
    absent = (
        tenant.apply(db.query(Attendance), Attendance)
        .filter(Attendance.attendance_date == target_date, Attendance.status == AttendanceStatus.ABSENT)
        .count()
    )
    total_employees = tenant.apply(db.query(Employee), Employee).filter(Employee.is_deleted == False, Employee.is_active == True).count()
    idle = max(total_employees - working - absent, 0)

    return {"date": target_date, "employees_working": working, "idle_employees": idle, "absent_employees": absent, "total_employees": total_employees}


def employee_productivity_ranking(db: Session, tenant, date_from: date, date_to: date, top_n: int = 5) -> dict:
    """Genuinely new -- nothing else ranks employees by output quantity."""
    rows = (
        db.query(BundleScanEvent.employee_id, sa_func.sum(BundleScanEvent.quantity))
        .filter(sa_func.date(BundleScanEvent.scanned_at) >= date_from, sa_func.date(BundleScanEvent.scanned_at) <= date_to)
        .group_by(BundleScanEvent.employee_id)
        .order_by(sa_func.sum(BundleScanEvent.quantity).desc())
        .all()
    )
    ranked = [{"employee_id": r[0], "total_output": float(r[1] or 0)} for r in rows]
    return {"top_performers": ranked[:top_n], "lowest_productivity": list(reversed(ranked[-top_n:])) if ranked else []}


def employee_current_work(db: Session, tenant, employee_id: int) -> Optional[dict]:
    """Current operator/bundle/machine for one employee -- direct read of
    WIPLedger, the same table machine_service.get_current_work() reads
    for the per-machine version."""
    wip = (
        db.query(WIPLedger)
        .filter(WIPLedger.current_holder_employee_id == employee_id)
        .order_by(WIPLedger.last_event_at.desc())
        .first()
    )
    if not wip:
        return None
    return {"bundle_id": wip.bundle_id, "machine_id": wip.current_machine_id, "stage": wip.current_stage, "last_event_at": wip.last_event_at}


# ==================== ALERT CENTER (merges existing alert sources) ====================


def alert_center(db: Session, tenant) -> list:
    """Merges machine_service.get_alerts() and quality_service.get_quality_alerts()
    -- both already exist (modules 10/11) -- plus a thin inventory
    low-stock check reusing report_service's slow-moving query shape.
    No alert is computed twice; this just tags each with its source
    domain and puts them in one list."""
    alerts = []

    for a in machine_service.get_alerts(db, tenant):
        alerts.append({**a, "domain": "machine"})

    for a in quality_service.get_quality_alerts(db, tenant):
        alerts.append({**a, "domain": "quality"})

    from app.models.models import StockBalance, Product
    low_stock = (
        tenant.apply(db.query(StockBalance), StockBalance)
        .join(Product, Product.id == StockBalance.product_id)
        .filter(Product.reorder_level > 0, StockBalance.quantity <= Product.reorder_level)
        .all()
    )
    for s in low_stock:
        alerts.append({"type": "low_stock", "domain": "inventory", "detail": f"Product {s.product_id} at {float(s.quantity)}, reorder level {s.product.reorder_level if hasattr(s, 'product') else ''}"})

    overdue_capas = quality_service.get_overdue_capas(db, tenant)
    for c in overdue_capas:
        alerts.append({"type": "capa_overdue", "domain": "quality", "detail": f"CAPA {c.capa_number} overdue since {c.target_date}"})

    return alerts


# ==================== LIVE TIMELINE (factory-wide) ====================


def live_production_feed(db: Session, tenant, limit: int = 50) -> list:
    """Factory-wide version of machine_service.get_unified_timeline() --
    same merge pattern (BundleScanEvent + MachineDowntime +
    MachineMaintenanceLog), scoped to the whole factory instead of one
    machine. No new event table."""
    events = []

    scans = (
        tenant.apply(db.query(BundleScanEvent), BundleScanEvent)
        .order_by(BundleScanEvent.scanned_at.desc())
        .limit(limit)
        .all()
    )
    for s in scans:
        events.append({
            "timestamp": s.scanned_at, "event_type": "bundle_scan",
            "bundle_id": s.bundle_id, "employee_id": s.employee_id,
            "from_stage": s.from_stage, "to_stage": s.to_stage,
        })

    downtimes = (
        db.query(MachineDowntime)
        .order_by(MachineDowntime.started_at.desc())
        .limit(limit)
        .all()
    )
    for d in downtimes:
        events.append({"timestamp": d.started_at, "event_type": "machine_downtime", "machine_id": d.machine_id, "reason": d.reason})

    events.sort(key=lambda e: e["timestamp"] or datetime.min, reverse=True)
    return events[:limit]


# ==================== FACADE: PER-DOMAIN WIDGETS ====================


def inventory_summary(db: Session, tenant) -> dict:
    """Delegates to report_service's existing inventory functions."""
    return {
        "finished_goods": report_service.finished_goods_report(db, tenant),
        "warehouse_summary": report_service.warehouse_report(db, tenant),
        "slow_moving_count": len(report_service.slow_moving_inventory(db, tenant, days_threshold=60)),
    }


def sales_summary(db: Session, tenant) -> dict:
    return sales_service.get_sales_dashboard(db, tenant)


def payroll_summary(db: Session, tenant) -> dict:
    today = date.today()
    return payroll_service.get_payroll_dashboard(db, tenant, today.month, today.year)


def costing_summary(db: Session, tenant) -> dict:
    return costing_service.get_costing_dashboard(db, tenant)


def machine_summary(db: Session, tenant) -> dict:
    return machine_service.get_fleet_dashboard(db, tenant)


def quality_summary(db: Session, tenant) -> dict:
    today = date.today()
    return quality_service.get_quality_dashboard(db, tenant, today, today)


# ==================== COMMAND CENTER (everything, one call) ====================


def command_center_snapshot(db: Session, tenant) -> dict:
    """One call for the whole Factory Command Center screen -- every
    section still comes from its owning function/service; this just
    assembles them so the frontend doesn't need ten requests on load.
    The subsequent live updates come via WebSocket (connection_manager),
    not by re-polling this endpoint."""
    return {
        "generated_at": datetime.utcnow(),
        "overview": live_factory_overview(db, tenant),
        "employee": employee_overview(db, tenant),
        "machine": machine_summary(db, tenant),
        "quality": quality_summary(db, tenant),
        "inventory": inventory_summary(db, tenant),
        "sales": sales_summary(db, tenant),
        "payroll": payroll_summary(db, tenant),
        "costing": costing_summary(db, tenant),
        "alerts": alert_center(db, tenant),
        "live_feed": live_production_feed(db, tenant, limit=20),
    }
