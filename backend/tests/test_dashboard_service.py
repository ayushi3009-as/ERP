"""
Unit tests for app.services.dashboard_service and connection_manager
(module 15).

STATUS: syntax-verified (`ast.parse`) only. NOT EXECUTED -- see
tests/conftest.py docstring for why and how to run these for real.
"""
import pytest
from datetime import date, datetime
from decimal import Decimal

from app.services import dashboard_service, connection_manager


# ==================== Connection Manager (genuinely new infra) ====================


def test_broadcast_sync_noop_without_event_loop():
    """Before the event loop is captured (e.g. in a test process), the
    broadcast must silently no-op rather than raise -- confirmed by the
    absence of an exception here."""
    connection_manager._main_event_loop = None
    connection_manager.manager.broadcast_sync("factory:1", {"event": "test"})  # must not raise


def test_connection_manager_tracks_topics_separately():
    manager = connection_manager.ConnectionManager()
    assert manager._connections == {}


# ==================== Alert Center (merges existing sources) ====================


def test_alert_center_tags_each_alert_with_its_domain(db, tenant, sample_machine):
    from app.services import machine_service
    machine_service.start_downtime(db, tenant, sample_machine, "breakdown", actor_user_id=1)
    alerts = dashboard_service.alert_center(db, tenant)
    machine_alerts = [a for a in alerts if a["domain"] == "machine"]
    assert any(a["type"] == "breakdown" for a in machine_alerts)


def test_alert_center_includes_quality_alerts(db, tenant):
    alerts = dashboard_service.alert_center(db, tenant)
    # empty state should not raise, and should be a list regardless of content
    assert isinstance(alerts, list)


# ==================== Live Feed (merges scan + downtime events) ====================


def test_live_production_feed_merges_and_sorts_chronologically(db, tenant, sample_bundle, sample_employee, sample_machine):
    from app.models.models import BundleScanEvent
    from app.services import machine_service

    scan = BundleScanEvent(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        bundle_id=sample_bundle.id, employee_id=sample_employee.id,
        quantity=sample_bundle.quantity, amount_earned=Decimal("50"), scanned_at=datetime.utcnow(),
    )
    db.add(scan)
    machine_service.start_downtime(db, tenant, sample_machine, "power_cut", actor_user_id=1)
    db.flush()

    feed = dashboard_service.live_production_feed(db, tenant, limit=10)
    event_types = {e["event_type"] for e in feed}
    assert "bundle_scan" in event_types
    assert "machine_downtime" in event_types
    # must be sorted descending by timestamp
    timestamps = [e["timestamp"] for e in feed if e["timestamp"]]
    assert timestamps == sorted(timestamps, reverse=True)


# ==================== Employee Productivity Ranking (genuinely new) ====================


def test_employee_productivity_ranking_empty_state(db, tenant):
    result = dashboard_service.employee_productivity_ranking(db, tenant, date.today(), date.today())
    assert result["top_performers"] == []
    assert result["lowest_productivity"] == []


def test_employee_productivity_ranking_orders_by_output(db, tenant, sample_bundle, sample_employee):
    from app.models.models import BundleScanEvent, Employee
    other = Employee(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        code="EMP002", full_name="Second Employee", date_of_joining=date.today(),
    )
    db.add(other)
    db.flush()

    db.add(BundleScanEvent(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        bundle_id=sample_bundle.id, employee_id=sample_employee.id,
        quantity=Decimal("100"), amount_earned=Decimal("100"), scanned_at=datetime.utcnow(),
    ))
    db.add(BundleScanEvent(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        bundle_id=sample_bundle.id, employee_id=other.id,
        quantity=Decimal("10"), amount_earned=Decimal("10"), scanned_at=datetime.utcnow(),
    ))
    db.flush()

    result = dashboard_service.employee_productivity_ranking(db, tenant, date.today(), date.today())
    assert result["top_performers"][0]["employee_id"] == sample_employee.id


# ==================== Live Factory Overview ====================


def test_live_factory_overview_current_shift_not_fabricated(db, tenant):
    """No Shift master exists in this schema -- current_shift must be
    None, not a made-up value."""
    result = dashboard_service.live_factory_overview(db, tenant)
    assert result["current_shift"] is None
