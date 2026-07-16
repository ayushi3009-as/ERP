# User Acceptance Testing Script — Microtechnique ERP

**How to use this document:** this is not a report of UAT already
performed — no real person has used this system yet, and simulating one
would be fabrication. This is a structured checklist for a **real person
in each role** to walk through against a **real running instance** with
**real seeded data**. Each scenario names the exact endpoint(s) it
exercises so a failure is traceable to a specific piece of code, not a
vague "something felt wrong."

Mark each row ✅ Pass / ❌ Fail / ⚠️ Pass with issue as you go. A UAT round
isn't complete until every row for that role has a mark.

---

## Factory Owner / Admin

| # | Scenario | Endpoint(s) exercised | Result |
|---|---|---|---|
| 1 | Log in, see the Factory Command Center with today's production/sales/cost/profit at a glance | `POST /auth/login`, `GET /command-center/snapshot` | |
| 2 | View the executive MIS for the last 7 days | `GET /analytics/mis` | |
| 3 | See which machines are running/idle/in breakdown right now | `GET /command-center/machine`, `GET /machine-tracking/fleet-dashboard` | |
| 4 | Review outstanding customer payments | `GET /sales-dispatch/customers/{id}/ledger`, `GET /analytics/sales/customer-wise` | |
| 5 | Configure company payroll policy (PF/ESI rates) | `GET/PUT /payroll/policy` | |
| 6 | Configure an AI provider and ask "Which lots are delayed?" | `POST /ai/providers`, `POST /ai/ask` | |

## Production Manager

| # | Scenario | Endpoint(s) exercised | Result |
|---|---|---|---|
| 1 | Create a Lot, set size breakdown, issue fabric, mark cutting complete | `POST /lots/`, `POST /lots/{id}/size-breakdown`, `POST /lots/{id}/fabric-issue`, `POST /lots/{id}/complete-cutting` | |
| 2 | Generate bundles from the completed lot | `POST /production/bundles/generate-from-lot` | |
| 3 | Assign a bundle to an operator | `POST /employee-work/issue` | |
| 4 | View current WIP across the factory | `GET /analytics/production/wip` | |
| 5 | Review today's production bottlenecks (AI) | `GET /ai/production/bottlenecks` | |
| 6 | Approve a rework request | `POST /bundles/rework/{id}/complete` | |

## Supervisor

| # | Scenario | Endpoint(s) exercised | Result |
|---|---|---|---|
| 1 | View employees working/idle/absent right now | `GET /command-center/employee/overview` | |
| 2 | Reassign a bundle from one operator to another | `POST /sales-dispatch`-adjacent `bundle_service.transfer_bundle` via `POST /bundles/{id}/transfer` | |
| 3 | Put a machine on hold for maintenance and resume it later | `POST /machine-tracking/{id}/downtime/start`, `POST /machine-tracking/downtime/{id}/end` | |
| 4 | View pending work / alerts for their line | `GET /command-center/alerts` | |

## QC Inspector

| # | Scenario | Endpoint(s) exercised | Result |
|---|---|---|---|
| 1 | Scan a bundle and record a pass/fail/rework inspection | `POST /mobile/quality/inspect` or `POST /quality/inspect-bundle` | |
| 2 | Attach a defect category and description to a rejected bundle | Same call, `defect_category_id`/`defect_description` fields | |
| 3 | Confirm a bundle cannot proceed to Packing without a passing inspection | `POST /production/scan` on a bundle with no/failed QC — expect rejection | |
| 4 | Open a CAPA for a repeat defect | `POST /quality/capa` | |
| 5 | Review the defect Pareto chart for the week | `GET /analytics/quality/pareto` | |

## Warehouse / Store Manager

| # | Scenario | Endpoint(s) exercised | Result |
|---|---|---|---|
| 1 | Receive a fabric roll against a GRN | `POST /fabric-rolls/`, `POST /fabric-rolls/{id}/inspect` | |
| 2 | Issue fabric to a lot | `POST /lots/{id}/fabric-issue` | |
| 3 | Perform a stock movement via the mobile scanner (fabric issue) | `POST /mobile/warehouse/stock-movement` | |
| 4 | Verify a warehouse/rack barcode matches the expected location | `POST /mobile/warehouse/verify-location` | |
| 5 | Review low-stock and dead-stock reports | `GET /analytics/inventory/slow-moving`, `GET /analytics/inventory/dead-stock` | |

## HR

| # | Scenario | Endpoint(s) exercised | Result |
|---|---|---|---|
| 1 | Mark daily attendance for an employee | `POST /payroll/attendance` | |
| 2 | Review today's attendance summary | `GET /command-center/employee/overview` | |
| 3 | Set an employee's salary type and grade | `PUT /employees/{id}` (salary_type/employee_grade fields) | |
| 4 | Review overtime report for the week | `GET /analytics/payroll/overtime` | |

## Accounts

| # | Scenario | Endpoint(s) exercised | Result |
|---|---|---|---|
| 1 | Generate salary slips for the month | `POST /payroll/salary-slips/generate` | |
| 2 | Walk a slip through the approval chain (Employee→Supervisor→HR→Accounts) | `POST /payroll/salary-slips/{id}/approve/{stage}` × 4 | |
| 3 | Record a customer payment against an invoice | `POST /sales-dispatch/payments` | |
| 4 | Review the GST report for the month | `GET /reports/gst` (the original, net sales-minus-purchase GST report) | |
| 5 | Review manufacturing cost sheet for a completed lot | `GET /analytics/cost/lot/{id}` | |

## Sales

| # | Scenario | Endpoint(s) exercised | Result |
|---|---|---|---|
| 1 | Create a quotation and convert it to a sales order | existing `sales.py` quotation/order endpoints | |
| 2 | Allocate finished goods against a sales order item | `POST /sales-dispatch/allocate` | |
| 3 | Create a packing list, add cartons, map bundles | `POST /sales-dispatch/packing-lists`, `.../cartons`, `.../map-bundle` | |
| 4 | Dispatch by scanning cartons/bundles | `POST /sales-dispatch/challans/{id}/scan` | |
| 5 | Process a customer return and confirm a credit note is issued | `POST /sales/returns` (delegates to `sales_service.process_sales_return`) | |

## Operator / Worker (mobile)

| # | Scenario | Endpoint(s) exercised | Result |
|---|---|---|---|
| 1 | Register their device and log in | `POST /mobile/devices/register`, `POST /auth/login` with `device_id` | |
| 2 | Start work (check in) | `POST /mobile/attendance/start-work` | |
| 3 | View assigned bundles | `GET /mobile/employee/{id}/assigned-bundles` | |
| 4 | Scan a bundle via the camera scanner | `POST /mobile/scan` | |
| 5 | View today's production and salary preview | `GET /mobile/employee/{id}/daily-production`, `.../salary-preview` | |
| 6 | Go offline, queue a few scans, reconnect and sync | `POST /mobile/sync/submit`, `GET /mobile/sync/{batch_id}/status` | |
| 7 | Stop work (check out) | `POST /mobile/attendance/stop-work` | |

---

## Sign-off

| Role | Tester name | Date | Overall result |
|---|---|---|---|
| Factory Owner | | | |
| Production Manager | | | |
| Supervisor | | | |
| QC Inspector | | | |
| Warehouse/Store Manager | | | |
| HR | | | |
| Accounts | | | |
| Sales | | | |
| Operator/Worker | | | |

**This UAT round is not a substitute for the automated test suites** —
it exists to catch usability and workflow issues real users find that
`pytest`/`Locust` won't (confusing error messages, missing fields on a
form, a workflow that's technically correct but impractical on a factory
floor). Run it after, not instead of, the runtime/integration suites in
`tests/` and `scripts/`.
