# Module 14 — Reports, Analytics & MIS

## A mistake made and corrected during this build — stated first, not buried

While building this module I initially wrote its new endpoint file to
`backend/app/api/v1/endpoints/reports.py` **without first checking
whether that file already existed**. It did — a genuine pre-session
910-line file with 10 working endpoints (`/reports/sales`, `/purchase`,
`/inventory`, `/production`, `/gst`, `/profit`, `/pending-orders`,
`/fabric-consumption`, `/worker`, `/daily-production`) — and my write
overwrote it. I caught this by checking `router.py`'s existing
registration before finishing the module, recovered the original file
from the untouched uploaded zip (`/mnt/user-data/uploads`), restored it
exactly, and moved my new work to `analytics.py` instead, mounted at
`/analytics` rather than `/reports`. No data or code was permanently
lost, but the near-miss is recorded here rather than silently fixed and
not mentioned. The lesson applied going forward: check for an existing
file before writing to any path, not just before deleting one.

Checking the recovered original also surfaced two **genuine** duplicate/
incompatibility findings (not the mistake above — these are real issues
in the pre-existing code, found while comparing it to this module's new
work):

1. **My own draft `gst_report` was a real duplicate** — a sales-invoice-only
   GST summation, inferior to the existing `/reports/gst` (which nets
   sales GST against purchase GST for actual liability). Removed from
   `report_service.py` before it shipped; the function now raises
   `NotImplementedError` pointing at the real endpoint, so any stray
   caller fails loudly instead of silently getting a wrong number.
2. **The existing `/reports/fabric-consumption` is now incomplete**, not
   because of anything in this module, but because it filters
   `StockLedger.reference_type == "production"` — a convention that
   predates the Fabric Roll/Lot workflow (modules 3–4). Fabric issued
   through `fabric_roll_service.issue_from_roll()` is tagged
   `"fabric_roll_issue"` (or the caller's own reference), never
   `"production"`. The old endpoint silently returns incomplete results
   for all current-workflow fabric consumption. This module's own
   `fabric_consumption_report()` (built on `LotFabricIssue`, the actual
   current source of truth) is the correct one going forward — exposed
   at `/analytics/inventory/fabric-consumption`. The old endpoint was
   deliberately left unmodified (not this module's file to change without
   broader review) but the incompatibility is documented in both the
   function's docstring and here, not silently left for someone to
   discover via a wrong number in production.

## Architecture Review

**Facade over 5 existing services, not a sixth calculation layer.**
22 report/dashboard functions already existed across `quality_service`,
`machine_service`, `payroll_service`, `costing_service`, `sales_service`
before this module started. `report_service.py`'s facade functions
(`quality_defect_trend`, `machine_utilization`, `payroll_register`,
`cost_lot_report`, `sales_customer_wise`, etc.) call those directly and
recompute nothing — verified mechanically, not just asserted: every
cross-service call in `report_service.py` was checked against the actual
function definitions in each service file (`grep`-based cross-reference,
run after writing the file, not before).

**Genuinely new** (the actual gaps): inventory ABC/slow-moving/dead-stock/
FIFO analysis (nothing else in this schema ranks or ages stock this
way), production register/WIP/finished-goods views (thin reads of
existing `Lot`/`WIPLedger`/`StockBalance`), payroll department/operation/
overtime breakdowns, sales trend/state-wise/customer-profitability,
overhead analysis, and Executive MIS + the unified dashboard (which
themselves call the other services' own dashboard functions rather than
re-deriving anything).

## Schema Review

**One new table**: `SavedFilter` (`user_id`, `report_name`,
`filter_name`, `filters` JSON). Stores filter *parameters* a user wants
to reuse, never computed report output — per the module's own "no
duplicate reporting tables" rule, results are always derived fresh at
request time.

**Nothing else was added.** Every other report reads from tables that
already existed: `Lot`, `Bundle`, `WIPLedger`, `StockBalance`,
`StockLedger`, `FabricRoll`, `LotFabricIssue`, `Attendance`,
`PayrollBonus`, `PayrollDeduction`, `SalarySlip`, `MachineDowntime`,
`Customer`, `SalesInvoice`, `OverheadCost`.

## API Review

`analytics.py` — 45 endpoints, grouped by domain, each a thin call into
`report_service`:

| Domain | Count | Examples |
|---|---|---|
| Manufacturing/Production | 4 | register, summary, WIP, finished-goods |
| Fabric & Inventory | 9 | fabric register/consumption/wastage, stock valuation, warehouse, ABC, slow-moving, dead-stock, FIFO |
| Quality | 5 | defect-trend, pareto, heatmap, CAPA, KPIs (all facades) |
| Payroll | 7 | register, statutory, department, overtime, bonus, deduction, cost-analysis |
| Machine | 6 | utilization, efficiency, downtime, breakdown, maintenance, operator-performance |
| Sales | 6 | customer-wise, product-wise, ledger, profitability, trend, state-wise |
| Cost | 4 | lot, operation, employee, overhead |
| MIS/Dashboard | 2 | `/mis`, `/dashboard` |
| Saved Filters | 2 | save, list |

**GST intentionally absent from this file** — see the correction note
above; use the pre-existing `/reports/gst`.

**Permissions**: role groups (`MANAGEMENT`, `QUALITY_VIEW`, `PAYROLL_VIEW`,
`COST_VIEW`, `SALES_VIEW`, `MACHINE_VIEW`, `INVENTORY_VIEW`,
`GENERAL_VIEW`, `FLOOR_VIEW`) reuse existing `UserRole` values —
Supervisor/Employee (`OPERATOR`/`WORKER`) only appear in `FLOOR_VIEW`,
gating exactly the production-floor reports (register, summary, WIP) —
never payroll, cost, or sales data.

## Performance Review

- No caching, no materialized views — every function queries live
  tables directly, per the explicit "profile before introducing caches"
  instruction. This has not been load-tested (no live database in this
  environment), so it's a documented starting position, not a
  performance guarantee.
- Aggregations use SQL `GROUP BY`/`SUM` rather than pulling rows into
  Python and summing — the exceptions are `customer_profitability_report`
  and `executive_mis`'s production summary, which iterate in Python
  because they call another service's per-record function
  (`get_invoice_profit`, quality-eligibility checks) that isn't
  expressible as a single aggregate query. Flagged as the most likely
  place to need optimization first if profiling shows a problem at the
  "millions of invoices" scale the module asks for.
- `slow_moving_inventory`/`dead_stock_report` filter on
  `StockBalance.last_movement_date`, already indexed implicitly via the
  table's existing unique index — no new index added since profiling
  hasn't shown a need.

## Verification Report

| Category | Status |
|---|---|
| ✅ Static Verification | 98/98 tables have exactly one migration; every `report_service.*` call from `analytics.py` (45) and every cross-service call within `report_service.py` (26) resolves to an actual function definition — checked mechanically via `grep`-based cross-reference, not just by running `ast.parse` |
| ✅ Syntax Verification | All 88 backend files pass `ast.parse` |
| ✅ Architecture Verification | Facade pattern confirmed; two genuine duplicate/incompatibility findings documented above rather than silently shipped or silently fixed |
| ⏳ Runtime Verification | **Pending** — no live PostgreSQL available in this environment |
| ⏳ Integration Verification | **Pending** |
| ⏳ Production Validation | **Pending** |

Unit tests: `tests/test_report_service.py` — 10 tests, including one
confirming the removed GST duplicate actually raises rather than
silently existing, and two that inspect function source to confirm
`executive_mis`/`unified_dashboard` genuinely delegate rather than
reimplement — written and syntax-verified, **never executed**.

## Migration

`0018_reports_analytics.py` — 1 new table (`saved_filters`).
