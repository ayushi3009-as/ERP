# Module 9 — Employee Issue / Receive

## What this is, and what it deliberately is NOT

A formal assign → receive → (complete | return) work-queue layer for
bundles at a specific operation. It is **not** a reimplementation of:

- **Bundle location tracking** (module 5's `Bundle.current_employee_id`,
  `BundleTransferLog`) — this module *calls*
  `bundle_service.transfer_bundle()` for the actual location change
  rather than duplicating it.
- **Operation completion** (module 6's `BundleScanEvent`) — scanning a
  bundle still works independently of whether it was formally issued
  first. `scan_service.process_scan()` calls
  `employee_work_service.auto_complete_for_scan()` as a courtesy (closes
  a dangling assignment if one exists) but never requires one.

The genuinely new piece is the **acknowledgement state machine**:
knowing whether a bundle handed to a worker has actually been picked up
yet, versus just reassigned on paper.

## Model

`WorkAssignment` (factory-scoped): `bundle_id`, `employee_id`,
`operation_id` (nullable), `machine_id` (nullable), `quantity` (nullable
= whole bundle), `status` (`assigned` → `received` → `completed` |
`returned` | `cancelled`), plus who/when for each transition.

## Service (`app/services/employee_work_service.py`)

- `issue_bundle()` — rejects if the bundle already has an open assignment
  (assigned or received, not yet closed); rejects a quantity exceeding
  the bundle; delegates the location change to `bundle_service`.
- `receive_bundle()` — only valid from `assigned`.
- `return_bundle()` — valid from `assigned` or `received`; optionally
  reassigns to a different employee via `bundle_service.transfer_bundle`,
  otherwise clears `current_employee_id` (bundle goes back to the pool).
- `auto_complete_for_scan()` — called by `scan_service`, not by any
  endpoint directly.
- `get_employee_queue()` — a worker's/supervisor's open-assignment list.

## API (`/employee-work`)

| Method | Path | Purpose | Roles |
|---|---|---|---|
| POST | `/issue` | Assign a bundle to an employee | manager roles |
| POST | `/{id}/receive` | Acknowledge receipt | manager or worker/operator |
| POST | `/{id}/return` | Return (optionally reassign) | manager or worker/operator |
| GET | `/queue/{employee_id}` | Open assignments for one employee | any authenticated user |
| GET | `/history/{bundle_id}` | Full assignment history for a bundle | any authenticated user |

Workers can call receive/return themselves once module 17 (mobile app)
gives them direct login access; until then a supervisor records on their
behalf using the same endpoints.

## Realtime events

`bundle_issued`, `bundle_received`, `bundle_returned` — all via the
existing `realtime_service.emit()`, no new event infrastructure.

## Audit logging

Every issue/receive/return call writes an `AuditLog` row via the same
`_create_audit_log()` pattern used by every other endpoint file in this
project — no new audit mechanism.

## Migration

`alembic/versions/0010_work_assignments.py` — creates `work_assignments`
+ the `work_assignment_status` enum.

## Verification status

| Category | Performed? |
|---|---|
| Static verification (table/column completeness vs models.py) | Not yet re-run since this module was added — see note below |
| Syntax verification | ✅ every file passes `ast.parse` |
| Architecture verification (thin controllers, service owns logic, reuses existing services) | ✅ self-reviewed — `issue_bundle`/`return_bundle` call `bundle_service.transfer_bundle` rather than duplicating; `scan_service` calls this module rather than the reverse |
| Runtime verification | ❌ not performed — no live database available |
| Integration verification | ❌ not performed |
| Production validation | ❌ not performed |

Unit tests exist at `tests/test_employee_work_service.py` — **written
and syntax-verified only, never executed** (no pytest, no database in
this environment). Run them for real with the project's own test
database before trusting their assertions.
