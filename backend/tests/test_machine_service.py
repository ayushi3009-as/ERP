"""
Unit tests for app.services.machine_service (module 10).

STATUS: syntax-verified (`ast.parse`) only. NOT EXECUTED — see
tests/conftest.py docstring for why and how to run these for real.
"""
import pytest
from datetime import date, timedelta

from app.services import machine_service
from app.models.models import MachineStatus, Employee


@pytest.fixture()
def sample_machine(db, tenant):
    from app.models.models import Machine
    m = Machine(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        name="Stitching Machine 1", code="M001", capacity_per_hour=50,
    )
    db.add(m)
    db.flush()
    return m


def test_update_status_valid(db, tenant, sample_machine):
    machine_service.update_status(db, tenant, sample_machine, "running", actor_user_id=1)
    assert sample_machine.status == MachineStatus.RUNNING


def test_update_status_invalid_raises(db, tenant, sample_machine):
    with pytest.raises(machine_service.MachineActionError, match="Invalid machine status"):
        machine_service.update_status(db, tenant, sample_machine, "flying", actor_user_id=1)


def test_start_downtime_sets_breakdown_status(db, tenant, sample_machine):
    dt = machine_service.start_downtime(db, tenant, sample_machine, "breakdown", actor_user_id=1)
    assert sample_machine.status == MachineStatus.BREAKDOWN
    assert dt.ended_at is None


def test_start_downtime_non_breakdown_sets_idle(db, tenant, sample_machine):
    machine_service.start_downtime(db, tenant, sample_machine, "power_cut", actor_user_id=1)
    assert sample_machine.status == MachineStatus.IDLE


def test_start_downtime_rejects_double_open_record(db, tenant, sample_machine):
    machine_service.start_downtime(db, tenant, sample_machine, "breakdown", actor_user_id=1)
    with pytest.raises(machine_service.MachineActionError, match="already has an open downtime"):
        machine_service.start_downtime(db, tenant, sample_machine, "power_cut", actor_user_id=1)


def test_end_downtime_computes_duration_and_resets_status(db, tenant, sample_machine):
    dt = machine_service.start_downtime(db, tenant, sample_machine, "breakdown", actor_user_id=1)
    machine_service.end_downtime(db, tenant, dt, actor_user_id=1)
    assert dt.ended_at is not None
    assert dt.duration_minutes is not None
    assert dt.duration_minutes >= 0
    assert sample_machine.status == MachineStatus.IDLE


def test_end_downtime_rejects_already_closed(db, tenant, sample_machine):
    dt = machine_service.start_downtime(db, tenant, sample_machine, "breakdown", actor_user_id=1)
    machine_service.end_downtime(db, tenant, dt, actor_user_id=1)
    with pytest.raises(machine_service.MachineActionError, match="already closed"):
        machine_service.end_downtime(db, tenant, dt, actor_user_id=1)


def test_log_maintenance_advances_next_due_from_interval(db, tenant, sample_machine):
    sample_machine.maintenance_interval_days = 30
    log = machine_service.log_maintenance(
        db, tenant, sample_machine, "preventive", actor_user_id=1,
    )
    assert sample_machine.last_maintenance == date.today()
    assert sample_machine.next_maintenance == date.today() + timedelta(days=30)


def test_log_maintenance_explicit_next_due_date_wins(db, tenant, sample_machine):
    sample_machine.maintenance_interval_days = 30
    explicit_date = date.today() + timedelta(days=5)
    machine_service.log_maintenance(
        db, tenant, sample_machine, "breakdown", actor_user_id=1, next_due_date=explicit_date,
    )
    assert sample_machine.next_maintenance == explicit_date


def test_log_maintenance_invalid_type_raises(db, tenant, sample_machine):
    with pytest.raises(machine_service.MachineActionError, match="preventive.*breakdown"):
        machine_service.log_maintenance(db, tenant, sample_machine, "oil_change", actor_user_id=1)


def test_get_current_work_none_when_no_wip(db, tenant, sample_machine):
    result = machine_service.get_current_work(db, tenant, sample_machine.id)
    assert result is None


def test_get_dashboard_counts_by_status(db, tenant, sample_machine):
    machine_service.update_status(db, tenant, sample_machine, "running", actor_user_id=1)
    dashboard = machine_service.get_dashboard(db, tenant)
    assert dashboard["total_machines"] == 1
    assert dashboard["by_status"]["running"] == 1


def test_get_alerts_flags_breakdown(db, tenant, sample_machine):
    machine_service.start_downtime(db, tenant, sample_machine, "breakdown", actor_user_id=1)
    alerts = machine_service.get_alerts(db, tenant)
    assert any(a["type"] == "breakdown" and a["machine_id"] == sample_machine.id for a in alerts)


def test_get_alerts_flags_maintenance_due_soon(db, tenant, sample_machine):
    sample_machine.next_maintenance = date.today() + timedelta(days=3)
    alerts = machine_service.get_alerts(db, tenant)
    assert any(a["type"] == "maintenance_due_soon" for a in alerts)


# ==================== Phase A: Capacity Planning ====================


def test_set_capacity_target_rejects_invalid_period_type(db, tenant, sample_machine):
    with pytest.raises(machine_service.MachineActionError, match="period_type"):
        machine_service.set_capacity_target(
            db, tenant, sample_machine, "yearly", date.today(), 100, actor_user_id=1,
        )


def test_set_capacity_target_rejects_nonpositive_quantity(db, tenant, sample_machine):
    with pytest.raises(machine_service.MachineActionError, match="positive"):
        machine_service.set_capacity_target(
            db, tenant, sample_machine, "daily", date.today(), 0, actor_user_id=1,
        )


def test_set_capacity_target_upserts_on_duplicate_period(db, tenant, sample_machine):
    machine_service.set_capacity_target(db, tenant, sample_machine, "daily", date.today(), 100, actor_user_id=1)
    machine_service.set_capacity_target(db, tenant, sample_machine, "daily", date.today(), 150, actor_user_id=1)
    result = machine_service.get_capacity_achievement(db, tenant, sample_machine, "daily", date.today())
    assert result["target_quantity"] == 150


def test_get_capacity_achievement_none_target_returns_none_pct(db, tenant, sample_machine):
    result = machine_service.get_capacity_achievement(db, tenant, sample_machine, "daily", date.today())
    assert result["target_quantity"] is None
    assert result["achievement_pct"] is None


# ==================== Phase B: Machine Allocation ====================


def test_reserve_machine_sets_reserved_status(db, tenant, sample_machine):
    machine_service.reserve_machine(db, tenant, sample_machine, actor_user_id=1)
    assert sample_machine.allocation_status.value == "reserved"


def test_reserve_machine_rejects_when_not_available(db, tenant, sample_machine):
    machine_service.reserve_machine(db, tenant, sample_machine, actor_user_id=1)
    with pytest.raises(machine_service.MachineActionError, match="cannot reserve"):
        machine_service.reserve_machine(db, tenant, sample_machine, actor_user_id=1)


def test_allocate_then_release_machine(db, tenant, sample_machine, sample_employee_for_machine):
    machine_service.allocate_machine(db, tenant, sample_machine, actor_user_id=1, employee_id=sample_employee_for_machine.id)
    assert sample_machine.allocation_status.value == "allocated"
    assert sample_machine.default_operator_id == sample_employee_for_machine.id

    machine_service.release_machine(db, tenant, sample_machine, actor_user_id=1)
    assert sample_machine.allocation_status.value == "available"


def test_lock_then_allocate_rejected(db, tenant, sample_machine):
    machine_service.lock_machine(db, tenant, sample_machine, actor_user_id=1)
    with pytest.raises(machine_service.MachineActionError, match="cannot allocate"):
        machine_service.allocate_machine(db, tenant, sample_machine, actor_user_id=1)


def test_decommission_deactivates_machine(db, tenant, sample_machine):
    machine_service.decommission_machine(db, tenant, sample_machine, actor_user_id=1)
    assert sample_machine.allocation_status.value == "decommissioned"
    assert sample_machine.is_active is False


def test_release_decommissioned_machine_rejected(db, tenant, sample_machine):
    machine_service.decommission_machine(db, tenant, sample_machine, actor_user_id=1)
    with pytest.raises(machine_service.MachineActionError, match="decommissioned"):
        machine_service.release_machine(db, tenant, sample_machine, actor_user_id=1)


# ==================== Phase D: Machine Health ====================


def test_get_health_zero_activity_gives_zero_breakdowns(db, tenant, sample_machine):
    result = machine_service.get_health(db, tenant, sample_machine, date.today() - timedelta(days=7), date.today())
    assert result["breakdown_count"] == 0
    assert result["mtbf_hours"] is None  # no breakdowns => MTBF undefined, not zero


def test_get_health_counts_breakdowns_in_period(db, tenant, sample_machine):
    dt = machine_service.start_downtime(db, tenant, sample_machine, "breakdown", actor_user_id=1)
    machine_service.end_downtime(db, tenant, dt, actor_user_id=1)
    result = machine_service.get_health(db, tenant, sample_machine, date.today(), date.today())
    assert result["breakdown_count"] == 1


# ==================== Phase E: Unified Timeline ====================


def test_unified_timeline_merges_allocation_and_downtime_events(db, tenant, sample_machine):
    machine_service.reserve_machine(db, tenant, sample_machine, actor_user_id=1)
    dt = machine_service.start_downtime(db, tenant, sample_machine, "power_cut", actor_user_id=1)
    machine_service.end_downtime(db, tenant, dt, actor_user_id=1)

    timeline = machine_service.get_unified_timeline(db, tenant, sample_machine.id)
    event_types = {e["event_type"] for e in timeline}
    assert "allocation_reserve" in event_types
    assert "downtime_started" in event_types
    assert "downtime_ended" in event_types


@pytest.fixture()
def sample_employee_for_machine(db, tenant):
    emp = Employee(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        code="EMPM01", full_name="Machine Operator", date_of_joining=date.today(),
    )
    db.add(emp)
    db.flush()
    return emp
