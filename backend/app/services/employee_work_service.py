"""
Employee Issue/Receive (module 9): the assign -> receive -> (complete |
return) work-queue layer for bundles.

Deliberately reuses bundle_service.transfer_bundle() for the actual
"who currently holds this bundle" location change instead of
re-implementing it — this module only adds the operation-context
assignment/acknowledgement state machine on top.
"""

from typing import Optional, List
from decimal import Decimal
from datetime import datetime
from sqlalchemy.orm import Session

from app.models.models import (
    WorkAssignment,
    WorkAssignmentStatus,
    Bundle,
    Employee,
    Operation,
    Machine,
)
from app.services import bundle_service, realtime_service


class WorkAssignmentError(ValueError):
    """Raised for any assignment validation failure — endpoints turn this
    into a 400, same pattern as every other *Error class in this codebase."""


def issue_bundle(
    db: Session,
    tenant,
    bundle: Bundle,
    employee: Employee,
    actor_user_id: int,
    operation_id: Optional[int] = None,
    machine_id: Optional[int] = None,
    quantity: Optional[float] = None,
    remarks: Optional[str] = None,
) -> WorkAssignment:
    open_existing = (
        db.query(WorkAssignment)
        .filter(
            WorkAssignment.bundle_id == bundle.id,
            WorkAssignment.status.in_(
                [WorkAssignmentStatus.ASSIGNED, WorkAssignmentStatus.RECEIVED]
            ),
        )
        .first()
    )
    if open_existing:
        raise WorkAssignmentError(
            f"Bundle {bundle.bundle_number} already has an open assignment "
            f"(id={open_existing.id}, employee_id={open_existing.employee_id}) — "
            f"return or complete it first"
        )

    if quantity is not None and Decimal(str(quantity)) > bundle.quantity:
        raise WorkAssignmentError("Assignment quantity cannot exceed bundle quantity")

    # Reuse bundle_service for the actual location move — not duplicated here.
    try:
        bundle_service.transfer_bundle(
            db, tenant, bundle, "employee", employee.id, actor_user_id,
            reason=f"Issued for operation {operation_id}" if operation_id else "Issued",
        )
    except bundle_service.BundleActionError as exc:
        raise WorkAssignmentError(str(exc))

    if machine_id is not None:
        try:
            bundle_service.transfer_bundle(
                db, tenant, bundle, "machine", machine_id, actor_user_id,
                reason="Assigned alongside employee issue",
            )
        except bundle_service.BundleActionError as exc:
            raise WorkAssignmentError(str(exc))

    assignment = WorkAssignment(
        company_id=tenant.company_id,
        factory_id=tenant.factory_id,
        bundle_id=bundle.id,
        employee_id=employee.id,
        operation_id=operation_id,
        machine_id=machine_id,
        quantity=Decimal(str(quantity)) if quantity is not None else None,
        status=WorkAssignmentStatus.ASSIGNED,
        assigned_by=actor_user_id,
        remarks=remarks,
    )
    db.add(assignment)
    db.flush()

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="bundle_issued", entity_type="work_assignment", entity_id=assignment.id,
        payload={"bundle_id": bundle.id, "employee_id": employee.id, "operation_id": operation_id},
    )
    return assignment


def receive_bundle(
    db: Session, tenant, assignment: WorkAssignment, actor_user_id: int
) -> WorkAssignment:
    if assignment.status != WorkAssignmentStatus.ASSIGNED:
        raise WorkAssignmentError(
            f"Assignment {assignment.id} has status '{assignment.status.value}', not 'assigned'"
        )
    assignment.status = WorkAssignmentStatus.RECEIVED
    assignment.received_at = datetime.utcnow()

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="bundle_received", entity_type="work_assignment", entity_id=assignment.id,
        payload={"bundle_id": assignment.bundle_id, "employee_id": assignment.employee_id},
    )
    return assignment


def return_bundle(
    db: Session,
    tenant,
    assignment: WorkAssignment,
    actor_user_id: int,
    reason: Optional[str] = None,
    return_to_employee_id: Optional[int] = None,
) -> WorkAssignment:
    if assignment.status not in (WorkAssignmentStatus.ASSIGNED, WorkAssignmentStatus.RECEIVED):
        raise WorkAssignmentError(
            f"Assignment {assignment.id} has status '{assignment.status.value}' and cannot be returned"
        )

    assignment.status = WorkAssignmentStatus.RETURNED
    assignment.returned_at = datetime.utcnow()
    assignment.return_reason = reason

    bundle = db.query(Bundle).filter(Bundle.id == assignment.bundle_id).first()
    if bundle and return_to_employee_id:
        try:
            bundle_service.transfer_bundle(
                db, tenant, bundle, "employee", return_to_employee_id, actor_user_id,
                reason=reason or "Returned and reassigned",
            )
        except bundle_service.BundleActionError as exc:
            raise WorkAssignmentError(str(exc))
    elif bundle:
        bundle.current_employee_id = None  # back in the pool, unassigned

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="bundle_returned", entity_type="work_assignment", entity_id=assignment.id,
        payload={"bundle_id": assignment.bundle_id, "reason": reason},
    )
    return assignment


def auto_complete_for_scan(
    db: Session, tenant, bundle_id: int, employee_id: int
) -> Optional[WorkAssignment]:
    """Called from scan_service.process_scan() — if the scanning employee
    has an open assignment for this bundle, mark it completed rather than
    leaving it dangling as 'received' forever. Silently no-ops if there's
    no open assignment (scans don't require a prior formal issue/receive —
    that's intentional, not every factory floor uses the assignment queue
    for every single bundle)."""
    assignment = (
        db.query(WorkAssignment)
        .filter(
            WorkAssignment.bundle_id == bundle_id,
            WorkAssignment.employee_id == employee_id,
            WorkAssignment.status.in_(
                [WorkAssignmentStatus.ASSIGNED, WorkAssignmentStatus.RECEIVED]
            ),
        )
        .order_by(WorkAssignment.assigned_at.desc())
        .first()
    )
    if not assignment:
        return None
    assignment.status = WorkAssignmentStatus.COMPLETED
    assignment.completed_at = datetime.utcnow()
    return assignment


def get_employee_queue(db: Session, tenant, employee_id: int) -> List[WorkAssignment]:
    query = (
        db.query(WorkAssignment)
        .filter(
            WorkAssignment.employee_id == employee_id,
            WorkAssignment.status.in_(
                [WorkAssignmentStatus.ASSIGNED, WorkAssignmentStatus.RECEIVED]
            ),
        )
    )
    query = tenant.apply(query, WorkAssignment)
    return query.order_by(WorkAssignment.assigned_at.asc()).all()
