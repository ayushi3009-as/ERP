"""
Unit tests for app.services.employee_work_service (module 9).

STATUS: syntax-verified (`ast.parse`) only. NOT EXECUTED — see
tests/conftest.py docstring for why and how to run these for real.
"""
import pytest

from app.services import employee_work_service
from app.models.models import WorkAssignmentStatus


def test_issue_bundle_creates_assignment(db, tenant, sample_bundle, sample_employee):
    assignment = employee_work_service.issue_bundle(
        db, tenant, sample_bundle, sample_employee, actor_user_id=1,
    )
    assert assignment.status == WorkAssignmentStatus.ASSIGNED
    assert assignment.bundle_id == sample_bundle.id
    assert assignment.employee_id == sample_employee.id
    # reused bundle_service.transfer_bundle — verify it actually moved the bundle
    assert sample_bundle.current_employee_id == sample_employee.id


def test_issue_bundle_rejects_double_assignment(db, tenant, sample_bundle, sample_employee):
    employee_work_service.issue_bundle(db, tenant, sample_bundle, sample_employee, actor_user_id=1)
    with pytest.raises(employee_work_service.WorkAssignmentError, match="already has an open assignment"):
        employee_work_service.issue_bundle(db, tenant, sample_bundle, sample_employee, actor_user_id=1)


def test_issue_bundle_rejects_quantity_exceeding_bundle(db, tenant, sample_bundle, sample_employee):
    with pytest.raises(employee_work_service.WorkAssignmentError, match="cannot exceed bundle quantity"):
        employee_work_service.issue_bundle(
            db, tenant, sample_bundle, sample_employee, actor_user_id=1, quantity=9999,
        )


def test_receive_bundle_transitions_assigned_to_received(db, tenant, sample_bundle, sample_employee):
    assignment = employee_work_service.issue_bundle(db, tenant, sample_bundle, sample_employee, actor_user_id=1)
    employee_work_service.receive_bundle(db, tenant, assignment, actor_user_id=1)
    assert assignment.status == WorkAssignmentStatus.RECEIVED
    assert assignment.received_at is not None


def test_receive_bundle_rejects_wrong_starting_status(db, tenant, sample_bundle, sample_employee):
    assignment = employee_work_service.issue_bundle(db, tenant, sample_bundle, sample_employee, actor_user_id=1)
    employee_work_service.receive_bundle(db, tenant, assignment, actor_user_id=1)
    with pytest.raises(employee_work_service.WorkAssignmentError, match="not 'assigned'"):
        employee_work_service.receive_bundle(db, tenant, assignment, actor_user_id=1)


def test_return_bundle_clears_current_employee_when_no_reassignment(db, tenant, sample_bundle, sample_employee):
    assignment = employee_work_service.issue_bundle(db, tenant, sample_bundle, sample_employee, actor_user_id=1)
    employee_work_service.return_bundle(db, tenant, assignment, actor_user_id=1, reason="end of shift")
    assert assignment.status == WorkAssignmentStatus.RETURNED
    assert sample_bundle.current_employee_id is None


def test_return_bundle_reassigns_when_target_given(db, tenant, sample_bundle, sample_employee):
    from datetime import date
    other = sample_employee.__class__(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        code="EMP002", full_name="Other Employee", date_of_joining=date.today(),
    )
    db.add(other)
    db.flush()

    assignment = employee_work_service.issue_bundle(db, tenant, sample_bundle, sample_employee, actor_user_id=1)
    employee_work_service.return_bundle(
        db, tenant, assignment, actor_user_id=1, return_to_employee_id=other.id,
    )
    assert sample_bundle.current_employee_id == other.id


def test_auto_complete_for_scan_closes_open_assignment(db, tenant, sample_bundle, sample_employee):
    assignment = employee_work_service.issue_bundle(db, tenant, sample_bundle, sample_employee, actor_user_id=1)
    employee_work_service.receive_bundle(db, tenant, assignment, actor_user_id=1)

    result = employee_work_service.auto_complete_for_scan(db, tenant, sample_bundle.id, sample_employee.id)
    assert result is not None
    assert result.status == WorkAssignmentStatus.COMPLETED
    assert result.completed_at is not None


def test_auto_complete_for_scan_noop_when_nothing_open(db, tenant, sample_bundle, sample_employee):
    result = employee_work_service.auto_complete_for_scan(db, tenant, sample_bundle.id, sample_employee.id)
    assert result is None


def test_get_employee_queue_only_returns_open_assignments(db, tenant, sample_bundle, sample_employee):
    assignment = employee_work_service.issue_bundle(db, tenant, sample_bundle, sample_employee, actor_user_id=1)
    queue = employee_work_service.get_employee_queue(db, tenant, sample_employee.id)
    assert len(queue) == 1
    assert queue[0].id == assignment.id

    employee_work_service.return_bundle(db, tenant, assignment, actor_user_id=1)
    queue_after_return = employee_work_service.get_employee_queue(db, tenant, sample_employee.id)
    assert len(queue_after_return) == 0
