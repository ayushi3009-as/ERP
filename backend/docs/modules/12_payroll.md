# Module 12 — Payroll Engine

## The core principle, stated once so it doesn't drift

`BundleScanEvent.amount_earned` (module 6) is **already** the per-scan
piece-rate calculation — rate resolved via `rate_service.resolve_rate()`
and snapshotted at scan time. This engine does not recompute piece
rates. Its job is to **aggregate** `BundleScanEvent` for a period,
**adjust for quality outcomes**, and combine that with attendance,
bonuses, and deductions into one `SalarySlip`. If you ever find yourself
adding a second place that multiplies a rate by a quantity for payroll
purposes, that's the bug this module exists to prevent.

## Two real architectural issues found and fixed, not just new code added

1. **The pre-existing `generate_salary_slips` computed piece-rate pay
   from `Attendance.pieces_completed × Employee.piece_rate`** — a
   completely separate, quality-blind calculation that predates the scan
   workflow (module 6) and ignored it entirely. Two conflicting ways to
   compute the same number is exactly the "duplicate formula" problem
   the instruction explicitly prohibits. Replaced with
   `payroll_service.generate_salary_slip()`, which sums
   `BundleScanEvent.amount_earned`.
2. **The pre-existing manual `POST /salary-slips` endpoint accepted
   arbitrary typed-in `basic_salary`/`piece_rate_amount`/etc.** — a
   direct violation of "no manual salary entries." Removed. The only way
   to create a `SalarySlip` now is `POST /salary-slips/generate`
   (single employee or bulk), which always goes through
   `payroll_service.generate_salary_slip()`.

Both were also never tenant-scoped, fixed as part of this pass.

## Quality integration (Phase-equivalent of your Bundle→Payroll diagram)

`_bundle_eligibility_ratios()` computes, per bundle: `passed_ratio` (full
pay) + `rework_ratio × (rework_pay_pct/100 if rework_payable else 0)` +
`reject_ratio × 0`. Applied uniformly to every scan against that bundle,
because a scan event itself doesn't know which specific pieces were
later rejected — that assessment happens at the bundle level via
`BundleReject`/`BundleRework` (already built in modules 5/11). Rework
payability is configurable via `PayrollPolicy.rework_payable`/
`rework_pay_pct`, defaulting to **unpaid** until a company opts in.

## Rate Master (extends `OperationRate`, doesn't duplicate it)

`OperationRate` gained `design_id`, `employee_grade`, `department_id`,
`machine_id`, `size_id`, `product_id` ("Item"), `customer_id` ("Buyer" —
same Customer entity documented on `Lot`, not a separate table).
`rate_service.resolve_rate()` was rewritten from a 2-dimension
(operation+style) lookup to most-specific-match-wins across all
dimensions: a candidate row qualifies only if every non-null dimension
*it* specifies matches what the caller passed, and among qualifying rows
the one specifying the most dimensions wins. **Backward compatible** —
callers passing only `operation_id`/`style_id` get identical behavior to
before, since this is a generalization of the same algorithm, not a
different one bolted on alongside it.

## Realtime recalculation (no manual synchronization)

- `scan_service.process_scan()` calls
  `payroll_service.recalculate_draft_slip()` after every scan.
- `quality_service.inspect_bundle()` calls it for every employee who
  scanned the affected bundle, after a reject/rework outcome.
- Recalculation **deletes and regenerates** the employee's current-period
  slip rather than patching fields in place — patching would mean
  duplicating `generate_salary_slip()`'s logic a second time.
- **Only DRAFT slips recalculate.** Once any approval stage has acted,
  the slip is frozen; a change in production/quality after that requires
  a new period's slip or an explicit adjustment, not silent renumbering
  of something already in the approval chain.

## Approval chain

`SalarySlipApproval` — one row per stage (Employee → Supervisor → HR →
Accounts), enforced sequentially: `approve_stage()` refuses to approve a
stage before the prior one has approved. `SalarySlip.status` flips to
`APPROVED` only when Accounts approves; any stage can `reject_stage()`,
which sets the slip to `REJECTED` immediately.

## What's honestly simplified, not silently missing

- **TDS is always `0`** — a real income-tax slab engine (regime,
  exemptions, prior Form 16 data) is out of scope for this pass; stored
  as `0` rather than a fabricated estimate.
- **No loss-of-pay slab logic** — monthly/staff employees currently get
  full basic salary regardless of absent-day count; only piece-rate
  workers' pay is fully attendance/production-driven. Noted as a known
  simplification in the service's own docstring.
- **Shift/break-time tracking** is limited to what `Attendance` already
  had (`check_in`/`check_out`/`overtime_hours`) — no dedicated Shift
  master was built; adding one is a reasonable next increment, not
  bundled in here to keep scope from ballooning further.
- **Performance**: aggregation is plain SQL `SUM`/`GROUP BY` over indexed
  columns (`BundleScanEvent.employee_id`+`scanned_at` already indexed
  since module 6), not a precomputed/cached incremental engine. Per the
  same principle applied to Lot's computed fields — cache only after
  profiling shows a real need, which requires a live environment this
  session doesn't have.

## API (`/payroll`, 22 endpoints)

Attendance CRUD (existing, now tenant-scoped) · `POST /salary-slips/generate`
(single or bulk) · `GET /salary-slips`, `/{id}` · approval:
`POST /salary-slips/{id}/approve/{stage}`, `/reject/{stage}`,
`GET /{id}/approval-history` · `POST/GET /advances`, `/bonuses`,
`/deductions` · `GET/PUT /policy` · `GET /dashboard`, `/register`,
`/reports/statutory`, `/reports/cost-analysis`.

## Migration

`0015_payroll_engine.py` — 3 new enums, `Employee`/`OperationRate`/
`SalarySlip` column additions, 4 new tables.

## Verification status

| Category | Performed? |
|---|---|
| Static verification | ✅ 87/87 tables, one migration each |
| Syntax verification | ✅ all 76 backend files pass `ast.parse` |
| Architecture verification (self-reviewed) | ✅ single calculation path (no second place computes a rate × quantity for pay); `rate_service.resolve_rate()` extended in place, not duplicated; recalculation regenerates via the same function rather than patching |
| Runtime verification | ⏳ Pending |
| Integration verification | ⏳ Pending |
| Production validation | ⏳ Pending |

Unit tests: `tests/test_payroll_service.py` — 14 tests focused on the
highest-risk logic (quality-adjusted production pay, sequential approval
enforcement, advance/loan balance deduction), written and syntax-verified,
**never executed**.
