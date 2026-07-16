"""
Machine Tracking (module 10).

Downtime and maintenance are the only genuinely new stored state — the
computed helpers (current bundle/lot, output, efficiency, alerts) all
read from WIPLedger/BundleScanEvent, which already exist, rather than
maintaining a second copy of "what's happening on this machine right now".
"""

from typing import Optional, List
from datetime import datetime, date, timedelta
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func

from app.models.models import (
    Machine,
    MachineStatus,
    MachineAllocationStatus,
    MachineDowntime,
    MachineMaintenanceLog,
    MachineAllocationLog,
    MachineCapacityTarget,
    WIPLedger,
    BundleScanEvent,
    Bundle,
    Employee,
    Department,
    ProductionLine,
    Factory,
)
from app.services import realtime_service

SHIFT_HOURS_PER_DAY = 8  # standard shift assumption, shared with get_efficiency
# below — a real shift-calendar model doesn't exist yet; noted here once
# rather than re-declaring the same magic number in every function.


class MachineActionError(ValueError):
    pass


def update_status(
    db: Session, tenant, machine: Machine, new_status: str, actor_user_id: int
) -> Machine:
    try:
        status_enum = MachineStatus(new_status)
    except ValueError:
        raise MachineActionError(f"Invalid machine status: {new_status}")
    old_status = machine.status
    machine.status = status_enum

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="machine_status_changed", entity_type="machine", entity_id=machine.id,
        payload={"from": old_status.value if old_status else None, "to": status_enum.value},
    )
    return machine


def start_downtime(
    db: Session,
    tenant,
    machine: Machine,
    reason: str,
    actor_user_id: int,
    remarks: Optional[str] = None,
) -> MachineDowntime:
    open_existing = (
        db.query(MachineDowntime)
        .filter(MachineDowntime.machine_id == machine.id, MachineDowntime.ended_at.is_(None))
        .first()
    )
    if open_existing:
        raise MachineActionError(
            f"Machine {machine.name} already has an open downtime record (id={open_existing.id})"
        )

    downtime = MachineDowntime(
        machine_id=machine.id, reason=reason, remarks=remarks, reported_by=actor_user_id,
    )
    db.add(downtime)

    machine.status = MachineStatus.BREAKDOWN if reason == "breakdown" else MachineStatus.IDLE

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="machine_downtime_started", entity_type="machine", entity_id=machine.id,
        payload={"reason": reason},
    )
    return downtime


def end_downtime(
    db: Session, tenant, downtime: MachineDowntime, actor_user_id: int
) -> MachineDowntime:
    if downtime.ended_at is not None:
        raise MachineActionError(f"Downtime record {downtime.id} is already closed")

    downtime.ended_at = datetime.utcnow()
    delta = downtime.ended_at - downtime.started_at
    downtime.duration_minutes = int(delta.total_seconds() // 60)

    machine = db.query(Machine).filter(Machine.id == downtime.machine_id).first()
    if machine:
        machine.status = MachineStatus.IDLE

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="machine_downtime_ended", entity_type="machine", entity_id=downtime.machine_id,
        payload={"duration_minutes": downtime.duration_minutes},
    )
    return downtime


def log_maintenance(
    db: Session,
    tenant,
    machine: Machine,
    maintenance_type: str,
    actor_user_id: int,
    performed_by: Optional[int] = None,
    cost: Optional[float] = None,
    remarks: Optional[str] = None,
    next_due_date: Optional[date] = None,
    vendor_id: Optional[int] = None,
    running_hours_at_service: Optional[float] = None,
    spare_parts: Optional[list] = None,
    attachments: Optional[list] = None,
) -> MachineMaintenanceLog:
    if maintenance_type not in ("preventive", "breakdown"):
        raise MachineActionError("maintenance_type must be 'preventive' or 'breakdown'")

    log = MachineMaintenanceLog(
        machine_id=machine.id,
        maintenance_type=maintenance_type,
        performed_by=performed_by,
        vendor_id=vendor_id,
        running_hours_at_service=Decimal(str(running_hours_at_service)) if running_hours_at_service is not None else None,
        spare_parts=spare_parts,
        attachments=attachments,
        cost=Decimal(str(cost)) if cost is not None else None,
        remarks=remarks,
        next_due_date=next_due_date,
        created_by=actor_user_id,
    )
    db.add(log)

    machine.last_maintenance = date.today()
    if next_due_date:
        machine.next_maintenance = next_due_date
    elif machine.maintenance_interval_days:
        machine.next_maintenance = date.today() + timedelta(days=machine.maintenance_interval_days)

    if machine.status == MachineStatus.MAINTENANCE:
        machine.status = MachineStatus.IDLE

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="machine_maintenance_logged", entity_type="machine", entity_id=machine.id,
        payload={"maintenance_type": maintenance_type, "next_due_date": str(machine.next_maintenance)},
    )
    return log


# ==================== COMPUTED (read-only, not stored) ====================


def get_current_work(db: Session, tenant, machine_id: int) -> Optional[dict]:
    wip = (
        db.query(WIPLedger)
        .filter(WIPLedger.current_machine_id == machine_id)
        .order_by(WIPLedger.last_event_at.desc())
        .first()
    )
    if not wip:
        return None
    bundle = db.query(Bundle).filter(Bundle.id == wip.bundle_id).first()
    if not bundle:
        return None
    return {
        "bundle_id": bundle.id,
        "bundle_number": bundle.bundle_number,
        "lot_id": bundle.lot_id,
        "lot_number": bundle.lot.lot_number if bundle.lot else None,
        "employee_id": wip.current_holder_employee_id,
        "stage": wip.current_stage,
        "last_event_at": wip.last_event_at,
    }


def get_timeline(db: Session, tenant, machine_id: int, limit: int = 50) -> List[BundleScanEvent]:
    query = db.query(BundleScanEvent).filter(BundleScanEvent.machine_id == machine_id)
    query = tenant.apply(query, BundleScanEvent)
    return query.order_by(BundleScanEvent.scanned_at.desc()).limit(limit).all()


def get_efficiency(
    db: Session, tenant, machine: Machine, date_from: date, date_to: date
) -> dict:
    total_output = (
        db.query(sa_func.coalesce(sa_func.sum(BundleScanEvent.quantity), 0))
        .filter(
            BundleScanEvent.machine_id == machine.id,
            sa_func.date(BundleScanEvent.scanned_at) >= date_from,
            sa_func.date(BundleScanEvent.scanned_at) <= date_to,
        )
        .scalar()
    )
    days = (date_to - date_from).days + 1
    theoretical_capacity = (machine.capacity_per_hour or 0) * SHIFT_HOURS_PER_DAY * days
    efficiency_pct = (
        round((float(total_output) / theoretical_capacity) * 100, 2)
        if theoretical_capacity > 0
        else None
    )
    return {
        "machine_id": machine.id,
        "date_from": date_from,
        "date_to": date_to,
        "actual_output": float(total_output),
        "theoretical_capacity": theoretical_capacity,
        "efficiency_pct": efficiency_pct,
    }


def get_dashboard(db: Session, tenant) -> dict:
    query = db.query(Machine).filter(Machine.is_deleted == False)
    query = tenant.apply(query, Machine)
    machines = query.all()

    by_status = {"idle": 0, "running": 0, "maintenance": 0, "breakdown": 0}
    for m in machines:
        if m.status:
            by_status[m.status.value] = by_status.get(m.status.value, 0) + 1

    return {
        "total_machines": len(machines),
        "by_status": by_status,
    }


def get_alerts(db: Session, tenant, idle_threshold_hours: int = 4) -> List[dict]:
    alerts = []
    query = db.query(Machine).filter(Machine.is_deleted == False)
    query = tenant.apply(query, Machine)
    machines = query.all()

    today = date.today()
    idle_cutoff = datetime.utcnow() - timedelta(hours=idle_threshold_hours)

    for m in machines:
        if m.status == MachineStatus.BREAKDOWN:
            alerts.append({"machine_id": m.id, "machine_name": m.name, "type": "breakdown", "detail": "Machine is in breakdown"})
        if m.next_maintenance and m.next_maintenance <= today + timedelta(days=7):
            overdue = m.next_maintenance < today
            alerts.append({
                "machine_id": m.id, "machine_name": m.name,
                "type": "maintenance_overdue" if overdue else "maintenance_due_soon",
                "detail": f"Preventive maintenance {'overdue since' if overdue else 'due'} {m.next_maintenance}",
            })
        if m.status == MachineStatus.IDLE:
            wip = db.query(WIPLedger).filter(WIPLedger.current_machine_id == m.id).order_by(WIPLedger.last_event_at.desc()).first()
            if wip and wip.last_event_at and wip.last_event_at < idle_cutoff:
                alerts.append({
                    "machine_id": m.id, "machine_name": m.name, "type": "idle_too_long",
                    "detail": f"Idle since {wip.last_event_at} (over {idle_threshold_hours}h)",
                })

    return alerts


# ==================== PHASE A: CAPACITY PLANNING ====================


def set_capacity_target(
    db: Session, tenant, machine: Machine, period_type: str,
    period_start_date: date, target_quantity: int, actor_user_id: int,
) -> MachineCapacityTarget:
    if period_type not in ("daily", "weekly", "monthly"):
        raise MachineActionError("period_type must be 'daily', 'weekly', or 'monthly'")
    if target_quantity <= 0:
        raise MachineActionError("target_quantity must be positive")

    existing = (
        db.query(MachineCapacityTarget)
        .filter(
            MachineCapacityTarget.machine_id == machine.id,
            MachineCapacityTarget.period_type == period_type,
            MachineCapacityTarget.period_start_date == period_start_date,
        )
        .first()
    )
    if existing:
        existing.target_quantity = target_quantity
        return existing

    target = MachineCapacityTarget(
        machine_id=machine.id, period_type=period_type,
        period_start_date=period_start_date, target_quantity=target_quantity,
        created_by=actor_user_id,
    )
    db.add(target)
    return target


def _period_bounds(period_type: str, period_start_date: date) -> tuple:
    if period_type == "daily":
        return period_start_date, period_start_date
    if period_type == "weekly":
        return period_start_date, period_start_date + timedelta(days=6)
    if period_type == "monthly":
        # simple 30-day window rather than pulling in a calendar-month
        # library dependency for something reports can refine later
        return period_start_date, period_start_date + timedelta(days=29)
    raise MachineActionError(f"Unknown period_type: {period_type}")


def get_capacity_achievement(
    db: Session, tenant, machine: Machine, period_type: str, period_start_date: date,
) -> dict:
    target_row = (
        db.query(MachineCapacityTarget)
        .filter(
            MachineCapacityTarget.machine_id == machine.id,
            MachineCapacityTarget.period_type == period_type,
            MachineCapacityTarget.period_start_date == period_start_date,
        )
        .first()
    )
    date_from, date_to = _period_bounds(period_type, period_start_date)
    achieved = (
        db.query(sa_func.coalesce(sa_func.sum(BundleScanEvent.quantity), 0))
        .filter(
            BundleScanEvent.machine_id == machine.id,
            sa_func.date(BundleScanEvent.scanned_at) >= date_from,
            sa_func.date(BundleScanEvent.scanned_at) <= date_to,
        )
        .scalar()
    )
    target_qty = target_row.target_quantity if target_row else None
    pct = round((float(achieved) / target_qty) * 100, 2) if target_qty else None
    return {
        "machine_id": machine.id, "period_type": period_type,
        "period_start_date": period_start_date, "period_end_date": date_to,
        "target_quantity": target_qty, "achieved_quantity": float(achieved),
        "achievement_pct": pct,
    }


def get_capacity_metrics(db: Session, tenant, machine: Machine, date_from: date, date_to: date) -> dict:
    """Utilization %, efficiency % (reuses get_efficiency — not
    recomputed), idle %, downtime %."""
    eff = get_efficiency(db, tenant, machine, date_from, date_to)

    days = (date_to - date_from).days + 1
    total_scheduled_hours = SHIFT_HOURS_PER_DAY * days

    downtime_minutes = (
        db.query(sa_func.coalesce(sa_func.sum(MachineDowntime.duration_minutes), 0))
        .filter(
            MachineDowntime.machine_id == machine.id,
            sa_func.date(MachineDowntime.started_at) >= date_from,
            sa_func.date(MachineDowntime.started_at) <= date_to,
            MachineDowntime.duration_minutes.isnot(None),
        )
        .scalar()
    )
    downtime_hours = float(downtime_minutes) / 60

    # Active-hours proxy: distinct hour-buckets with at least one scan —
    # a lower bound on true running time, not an exact continuous-state
    # measurement (no MachineStateLog exists to track that precisely).
    # This is a documented approximation, not a claim of precision.
    active_hour_buckets = (
        db.query(sa_func.count(sa_func.distinct(sa_func.date_trunc("hour", BundleScanEvent.scanned_at))))
        .filter(
            BundleScanEvent.machine_id == machine.id,
            sa_func.date(BundleScanEvent.scanned_at) >= date_from,
            sa_func.date(BundleScanEvent.scanned_at) <= date_to,
        )
        .scalar()
    ) or 0

    running_hours = min(float(active_hour_buckets), total_scheduled_hours)
    idle_hours = max(total_scheduled_hours - running_hours - downtime_hours, 0)

    utilization_pct = round((running_hours / total_scheduled_hours) * 100, 2) if total_scheduled_hours else None
    idle_pct = round((idle_hours / total_scheduled_hours) * 100, 2) if total_scheduled_hours else None
    downtime_pct = round((downtime_hours / total_scheduled_hours) * 100, 2) if total_scheduled_hours else None

    return {
        "machine_id": machine.id, "date_from": date_from, "date_to": date_to,
        "capacity_utilization_pct": utilization_pct,
        "efficiency_pct": eff["efficiency_pct"],
        "idle_pct": idle_pct,
        "downtime_pct": downtime_pct,
        "running_hours_approx": round(running_hours, 1),
        "idle_hours_approx": round(idle_hours, 1),
        "downtime_hours": round(downtime_hours, 1),
        "note": "running/idle hours are an approximation based on hourly scan-activity "
                "buckets, not continuous state tracking — downtime_hours is precise "
                "(from MachineDowntime records).",
    }


# ==================== PHASE B: MACHINE ALLOCATION ====================


def _log_allocation(
    db, tenant, machine, action, actor_user_id, employee_id=None,
    department_id=None, production_line_id=None, from_factory_id=None,
    to_factory_id=None, reason=None,
) -> MachineAllocationLog:
    log = MachineAllocationLog(
        machine_id=machine.id, action=action, employee_id=employee_id,
        department_id=department_id, production_line_id=production_line_id,
        from_factory_id=from_factory_id, to_factory_id=to_factory_id,
        reason=reason, performed_by=actor_user_id,
    )
    db.add(log)
    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type=f"machine_{action}", entity_type="machine", entity_id=machine.id,
        payload={"action": action, "employee_id": employee_id},
    )
    return log


def reserve_machine(db, tenant, machine: Machine, actor_user_id: int, employee_id=None, reason=None):
    if machine.allocation_status not in (MachineAllocationStatus.AVAILABLE,):
        raise MachineActionError(f"Machine is '{machine.allocation_status.value}', cannot reserve")
    machine.allocation_status = MachineAllocationStatus.RESERVED
    return _log_allocation(db, tenant, machine, "reserve", actor_user_id, employee_id=employee_id, reason=reason)


def allocate_machine(
    db, tenant, machine: Machine, actor_user_id: int, employee_id=None,
    department_id=None, production_line_id=None, reason=None,
):
    if machine.allocation_status in (MachineAllocationStatus.LOCKED, MachineAllocationStatus.DECOMMISSIONED):
        raise MachineActionError(f"Machine is '{machine.allocation_status.value}', cannot allocate")
    machine.allocation_status = MachineAllocationStatus.ALLOCATED
    if department_id:
        machine.department_id = department_id
    if production_line_id:
        machine.production_line_id = production_line_id
    if employee_id:
        machine.default_operator_id = employee_id
    return _log_allocation(
        db, tenant, machine, "allocate", actor_user_id, employee_id=employee_id,
        department_id=department_id, production_line_id=production_line_id, reason=reason,
    )


def release_machine(db, tenant, machine: Machine, actor_user_id: int, reason=None):
    if machine.allocation_status == MachineAllocationStatus.DECOMMISSIONED:
        raise MachineActionError("Cannot release a decommissioned machine")
    machine.allocation_status = MachineAllocationStatus.AVAILABLE
    return _log_allocation(db, tenant, machine, "release", actor_user_id, reason=reason)


def transfer_machine(
    db, tenant, machine: Machine, actor_user_id: int, to_factory_id: int, reason=None,
):
    if machine.allocation_status == MachineAllocationStatus.LOCKED:
        raise MachineActionError("Cannot transfer a locked machine")
    to_factory = db.query(Factory).filter(Factory.id == to_factory_id).first()
    if not to_factory:
        raise MachineActionError("Destination factory not found")
    if to_factory.company_id != tenant.company_id:
        raise MachineActionError("Cannot transfer a machine across companies")
    from_factory_id = machine.factory_id
    machine.factory_id = to_factory_id
    return _log_allocation(
        db, tenant, machine, "transfer", actor_user_id,
        from_factory_id=from_factory_id, to_factory_id=to_factory_id, reason=reason,
    )


def lock_machine(db, tenant, machine: Machine, actor_user_id: int, reason=None):
    if machine.allocation_status == MachineAllocationStatus.DECOMMISSIONED:
        raise MachineActionError("Cannot lock a decommissioned machine")
    machine.allocation_status = MachineAllocationStatus.LOCKED
    return _log_allocation(db, tenant, machine, "lock", actor_user_id, reason=reason)


def unlock_machine(db, tenant, machine: Machine, actor_user_id: int, reason=None):
    if machine.allocation_status != MachineAllocationStatus.LOCKED:
        raise MachineActionError("Machine is not locked")
    machine.allocation_status = MachineAllocationStatus.AVAILABLE
    return _log_allocation(db, tenant, machine, "unlock", actor_user_id, reason=reason)


def decommission_machine(db, tenant, machine: Machine, actor_user_id: int, reason=None):
    machine.allocation_status = MachineAllocationStatus.DECOMMISSIONED
    machine.is_active = False
    return _log_allocation(db, tenant, machine, "decommission", actor_user_id, reason=reason)


# ==================== PHASE D: MACHINE HEALTH ====================


def get_health(db, tenant, machine: Machine, date_from: date, date_to: date) -> dict:
    """Every figure here is computed from MachineDowntime/
    MachineMaintenanceLog/BundleScanEvent — no new storage, per the
    "compute don't store" principle applied throughout this module."""
    metrics = get_capacity_metrics(db, tenant, machine, date_from, date_to)

    breakdown_count = (
        db.query(sa_func.count(MachineDowntime.id))
        .filter(
            MachineDowntime.machine_id == machine.id, MachineDowntime.reason == "breakdown",
            sa_func.date(MachineDowntime.started_at) >= date_from,
            sa_func.date(MachineDowntime.started_at) <= date_to,
        )
        .scalar()
    ) or 0

    repair_count = (
        db.query(sa_func.count(MachineMaintenanceLog.id))
        .filter(
            MachineMaintenanceLog.machine_id == machine.id,
            MachineMaintenanceLog.maintenance_type == "breakdown",
            sa_func.date(MachineMaintenanceLog.performed_at) >= date_from,
            sa_func.date(MachineMaintenanceLog.performed_at) <= date_to,
        )
        .scalar()
    ) or 0

    avg_repair_minutes = (
        db.query(sa_func.avg(MachineDowntime.duration_minutes))
        .filter(
            MachineDowntime.machine_id == machine.id, MachineDowntime.reason == "breakdown",
            MachineDowntime.duration_minutes.isnot(None),
            sa_func.date(MachineDowntime.started_at) >= date_from,
            sa_func.date(MachineDowntime.started_at) <= date_to,
        )
        .scalar()
    )
    mttr_hours = round(float(avg_repair_minutes) / 60, 2) if avg_repair_minutes else None

    running_hours = metrics["running_hours_approx"]
    mtbf_hours = round(running_hours / breakdown_count, 2) if breakdown_count > 0 else None

    # Health score: a simple weighted composite (0-100), not a scientific
    # formula — efficiency and uptime matter more than raw breakdown
    # count, since a machine that breaks rarely but runs slowly still
    # needs attention. Documented weighting, easy to tune later.
    efficiency_component = metrics["efficiency_pct"] or 0
    uptime_pct = 100 - (metrics["downtime_pct"] or 0)
    breakdown_penalty = min(breakdown_count * 5, 30)  # cap so one bad week doesn't zero it out
    health_score = round(max(0, (efficiency_component * 0.4) + (uptime_pct * 0.4) + (20 - breakdown_penalty * 0.67)), 1)

    return {
        "machine_id": machine.id, "date_from": date_from, "date_to": date_to,
        "running_hours_approx": running_hours,
        "idle_hours_approx": metrics["idle_hours_approx"],
        "downtime_hours": metrics["downtime_hours"],
        "breakdown_count": breakdown_count,
        "repair_count": repair_count,
        "mtbf_hours": mtbf_hours,
        "mttr_hours": mttr_hours,
        "health_score": health_score,
        "note": metrics["note"] + " Health score is a documented weighted composite "
                "(40% efficiency, 40% uptime, 20% minus breakdown penalty), not an "
                "industry-standard formula.",
    }


# ==================== PHASE E: UNIFIED MACHINE TIMELINE ====================


def get_unified_timeline(db, tenant, machine_id: int, limit: int = 100) -> List[dict]:
    """Merges MachineAllocationLog (allocated/released/transferred/locked),
    BundleScanEvent (bundle assigned/running), and MachineDowntime/
    MachineMaintenanceLog (stopped/maintenance/resumed) into one
    chronological feed — no new event table, just a merge of what already
    exists across modules 6, 9, and this one."""
    events = []

    for log in db.query(MachineAllocationLog).filter(MachineAllocationLog.machine_id == machine_id).all():
        events.append({
            "timestamp": log.performed_at, "event_type": f"allocation_{log.action}",
            "employee_id": log.employee_id, "reason": log.reason,
        })

    for scan in db.query(BundleScanEvent).filter(BundleScanEvent.machine_id == machine_id).all():
        events.append({
            "timestamp": scan.scanned_at, "event_type": "bundle_scan",
            "bundle_id": scan.bundle_id, "employee_id": scan.employee_id,
            "from_stage": scan.from_stage, "to_stage": scan.to_stage,
        })

    for dt in db.query(MachineDowntime).filter(MachineDowntime.machine_id == machine_id).all():
        events.append({
            "timestamp": dt.started_at, "event_type": "downtime_started", "reason": dt.reason,
        })
        if dt.ended_at:
            events.append({
                "timestamp": dt.ended_at, "event_type": "downtime_ended",
                "duration_minutes": dt.duration_minutes,
            })

    for m in db.query(MachineMaintenanceLog).filter(MachineMaintenanceLog.machine_id == machine_id).all():
        events.append({
            "timestamp": m.performed_at, "event_type": f"maintenance_{m.maintenance_type}",
            "performed_by": m.performed_by,
        })

    events.sort(key=lambda e: e["timestamp"] or datetime.min, reverse=True)
    return events[:limit]


# ==================== PHASE F: REALTIME FLEET DASHBOARD ====================


def get_fleet_dashboard(db, tenant) -> dict:
    base = get_dashboard(db, tenant)

    query = db.query(Machine).filter(Machine.is_deleted == False)
    query = tenant.apply(query, Machine)
    machines = query.all()

    today = date.today()
    upcoming_maintenance = [
        {"machine_id": m.id, "machine_name": m.name, "next_maintenance": m.next_maintenance}
        for m in machines
        if m.next_maintenance and m.next_maintenance <= today + timedelta(days=14)
    ]

    live_production = (
        db.query(BundleScanEvent.machine_id, sa_func.sum(BundleScanEvent.quantity))
        .filter(
            BundleScanEvent.machine_id.isnot(None),
            sa_func.date(BundleScanEvent.scanned_at) == today,
        )
        .group_by(BundleScanEvent.machine_id)
        .all()
    )
    live_production_by_machine = [
        {"machine_id": mid, "quantity_today": float(qty)} for mid, qty in live_production
    ]

    base.update({
        "upcoming_maintenance": upcoming_maintenance,
        "live_production_by_machine": live_production_by_machine,
        "alerts": get_alerts(db, tenant),
    })
    return base


def get_performance_ranking(db, tenant, date_from: date, date_to: date, top_n: int = 5) -> dict:
    query = db.query(Machine).filter(Machine.is_deleted == False, Machine.capacity_per_hour > 0)
    query = tenant.apply(query, Machine)
    machines = query.all()

    scored = []
    for m in machines:
        eff = get_efficiency(db, tenant, m, date_from, date_to)
        if eff["efficiency_pct"] is not None:
            scored.append({"machine_id": m.id, "machine_name": m.name, "efficiency_pct": eff["efficiency_pct"]})

    scored.sort(key=lambda x: x["efficiency_pct"], reverse=True)
    return {
        "top_performing": scored[:top_n],
        "least_efficient": list(reversed(scored[-top_n:])) if scored else [],
    }


# ==================== PHASE G: REPORTS ====================


def report_production(db, tenant, date_from: date, date_to: date) -> List[dict]:
    rows = (
        db.query(
            BundleScanEvent.machine_id,
            sa_func.sum(BundleScanEvent.quantity).label("total_output"),
            sa_func.count(BundleScanEvent.id).label("scan_count"),
        )
        .filter(
            BundleScanEvent.machine_id.isnot(None),
            sa_func.date(BundleScanEvent.scanned_at) >= date_from,
            sa_func.date(BundleScanEvent.scanned_at) <= date_to,
        )
        .group_by(BundleScanEvent.machine_id)
        .all()
    )
    return [{"machine_id": r[0], "total_output": float(r[1]), "scan_count": r[2]} for r in rows]


def report_efficiency(db, tenant, date_from: date, date_to: date) -> List[dict]:
    query = db.query(Machine).filter(Machine.is_deleted == False)
    query = tenant.apply(query, Machine)
    return [
        get_efficiency(db, tenant, m, date_from, date_to)
        for m in query.all()
    ]


def report_downtime(db, tenant, date_from: date, date_to: date) -> List[dict]:
    rows = (
        db.query(
            MachineDowntime.machine_id,
            MachineDowntime.reason,
            sa_func.sum(MachineDowntime.duration_minutes).label("total_minutes"),
            sa_func.count(MachineDowntime.id).label("occurrences"),
        )
        .filter(
            sa_func.date(MachineDowntime.started_at) >= date_from,
            sa_func.date(MachineDowntime.started_at) <= date_to,
            MachineDowntime.duration_minutes.isnot(None),
        )
        .group_by(MachineDowntime.machine_id, MachineDowntime.reason)
        .all()
    )
    return [
        {"machine_id": r[0], "reason": r[1], "total_minutes": r[2], "occurrences": r[3]}
        for r in rows
    ]


def report_maintenance(db, tenant, date_from: date, date_to: date) -> List[dict]:
    rows = (
        db.query(MachineMaintenanceLog)
        .filter(
            sa_func.date(MachineMaintenanceLog.performed_at) >= date_from,
            sa_func.date(MachineMaintenanceLog.performed_at) <= date_to,
        )
        .all()
    )
    return [
        {
            "machine_id": r.machine_id, "maintenance_type": r.maintenance_type,
            "performed_at": r.performed_at, "cost": float(r.cost) if r.cost else None,
            "vendor_id": r.vendor_id,
        }
        for r in rows
    ]


def report_operator(db, tenant, date_from: date, date_to: date) -> List[dict]:
    """Which employees ran which machines and how much they produced —
    reuses BundleScanEvent, the same source module 12's payroll engine
    will read from, so this report and payroll can never disagree."""
    rows = (
        db.query(
            BundleScanEvent.employee_id,
            BundleScanEvent.machine_id,
            sa_func.sum(BundleScanEvent.quantity).label("total_output"),
        )
        .filter(
            BundleScanEvent.machine_id.isnot(None),
            sa_func.date(BundleScanEvent.scanned_at) >= date_from,
            sa_func.date(BundleScanEvent.scanned_at) <= date_to,
        )
        .group_by(BundleScanEvent.employee_id, BundleScanEvent.machine_id)
        .all()
    )
    return [
        {"employee_id": r[0], "machine_id": r[1], "total_output": float(r[2])}
        for r in rows
    ]


def report_utilization(db, tenant, date_from: date, date_to: date) -> List[dict]:
    query = db.query(Machine).filter(Machine.is_deleted == False)
    query = tenant.apply(query, Machine)
    return [
        get_capacity_metrics(db, tenant, m, date_from, date_to)
        for m in query.all()
    ]
