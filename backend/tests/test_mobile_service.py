"""
Unit tests for app.services.mobile_service (module 17).

STATUS: syntax-verified (`ast.parse`) only. NOT EXECUTED -- see
tests/conftest.py docstring for why and how to run these for real.
"""
import pytest
from datetime import datetime

from app.services import mobile_service


# ==================== Device Registration ====================


def test_register_device_rejects_unsupported_platform(db, tenant):
    with pytest.raises(mobile_service.MobileError, match="Unsupported platform"):
        mobile_service.register_device(db, user_id=1, device_identifier="dev1", platform="blackberry")


def test_register_device_upserts_on_same_identifier(db, tenant):
    first = mobile_service.register_device(db, user_id=1, device_identifier="dev1", platform="android")
    db.flush()
    second = mobile_service.register_device(db, user_id=1, device_identifier="dev1", platform="android", app_version="2.0")
    assert first.id == second.id
    assert second.app_version == "2.0"


def test_logout_device_revokes_only_that_devices_sessions(db, tenant):
    from app.models.models import UserSession
    from datetime import timedelta
    device = mobile_service.register_device(db, user_id=1, device_identifier="dev1", platform="android")
    db.flush()
    other_device = mobile_service.register_device(db, user_id=1, device_identifier="dev2", platform="ios")
    db.flush()

    s1 = UserSession(user_id=1, refresh_token="tok1", device_id=device.id, expires_at=datetime.utcnow() + timedelta(days=1))
    s2 = UserSession(user_id=1, refresh_token="tok2", device_id=other_device.id, expires_at=datetime.utcnow() + timedelta(days=1))
    db.add_all([s1, s2])
    db.flush()

    count = mobile_service.logout_device(db, user_id=1, device_id=device.id)
    assert count == 1
    assert s1.is_revoked is True
    assert s2.is_revoked is False


def test_logout_device_rejects_unknown_device(db, tenant):
    with pytest.raises(mobile_service.MobileError, match="Device not found"):
        mobile_service.logout_device(db, user_id=1, device_id=9999)


# ==================== Employee Features ====================


def test_start_work_rejects_double_checkin(db, tenant, sample_employee):
    mobile_service.start_work(db, tenant, sample_employee.id, actor_user_id=1)
    with pytest.raises(mobile_service.MobileError, match="Already checked in"):
        mobile_service.start_work(db, tenant, sample_employee.id, actor_user_id=1)


def test_stop_work_rejects_without_checkin(db, tenant, sample_employee):
    with pytest.raises(mobile_service.MobileError, match="No check-in found"):
        mobile_service.stop_work(db, tenant, sample_employee.id)


def test_start_then_stop_work(db, tenant, sample_employee):
    mobile_service.start_work(db, tenant, sample_employee.id, actor_user_id=1)
    record = mobile_service.stop_work(db, tenant, sample_employee.id)
    assert record.check_out is not None


# ==================== Role-Scoped Screens ====================


def test_get_mobile_screens_for_worker_excludes_payroll_management(db, tenant):
    from app.models.models import UserRole
    screens = mobile_service.get_mobile_screens_for_role(UserRole.WORKER)
    assert "assigned_bundles" in screens
    assert "payroll_alerts" not in screens


def test_get_mobile_screens_for_unknown_role_defaults_to_notifications(db, tenant):
    from app.models.models import UserRole
    screens = mobile_service.get_mobile_screens_for_role(UserRole.SUPER_ADMIN)
    assert screens == ["notifications"]  # not in ROLE_SCREENS map -- safe default, not an error


# ==================== Offline Sync (highest-risk logic) ====================


def test_submit_offline_batch_rejects_unsupported_action_type(db, tenant):
    device = mobile_service.register_device(db, user_id=1, device_identifier="dev1", platform="android")
    db.flush()
    with pytest.raises(mobile_service.MobileError, match="Unsupported offline action_type"):
        mobile_service.submit_offline_batch(db, tenant, device.id, actor_user_id=1, items=[
            {"action_type": "teleport_bundle", "payload": {}, "client_sequence": 1, "client_timestamp": datetime.utcnow()},
        ])


def test_submit_offline_batch_rejects_unknown_device(db, tenant):
    with pytest.raises(mobile_service.MobileError, match="Device not found"):
        mobile_service.submit_offline_batch(db, tenant, device_id=9999, actor_user_id=1, items=[])


def test_process_offline_batch_replays_in_client_sequence_order(db, tenant, sample_employee):
    device = mobile_service.register_device(db, user_id=1, device_identifier="dev1", platform="android")
    db.flush()
    batch = mobile_service.submit_offline_batch(db, tenant, device.id, actor_user_id=1, items=[
        {"action_type": "attendance_start", "payload": {"employee_id": sample_employee.id}, "client_sequence": 1, "client_timestamp": datetime.utcnow()},
        {"action_type": "attendance_stop", "payload": {"employee_id": sample_employee.id}, "client_sequence": 2, "client_timestamp": datetime.utcnow()},
    ])
    db.flush()

    result = mobile_service.process_offline_batch(db, tenant, batch, actor_user_id=1)
    assert result.synced_items == 2
    assert result.failed_items == 0
    assert result.status.value == "synced"


def test_process_offline_batch_marks_conflict_not_crash_on_business_rule_violation(db, tenant, sample_employee):
    """A double check-in queued offline must surface as a CONFLICT item,
    not crash the whole batch -- confirms conflict detection reuses
    start_work()'s own validation rather than a separate offline check."""
    device = mobile_service.register_device(db, user_id=1, device_identifier="dev1", platform="android")
    db.flush()
    batch = mobile_service.submit_offline_batch(db, tenant, device.id, actor_user_id=1, items=[
        {"action_type": "attendance_start", "payload": {"employee_id": sample_employee.id}, "client_sequence": 1, "client_timestamp": datetime.utcnow()},
        {"action_type": "attendance_start", "payload": {"employee_id": sample_employee.id}, "client_sequence": 2, "client_timestamp": datetime.utcnow()},
    ])
    db.flush()

    result = mobile_service.process_offline_batch(db, tenant, batch, actor_user_id=1)
    assert result.synced_items == 1
    assert result.conflict_items == 1
    assert result.status.value == "conflict"
