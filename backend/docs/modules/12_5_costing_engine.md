# Module 12.5 — Manufacturing Costing Engine

## Architecture Review

**Single calculation service confirmed**: every cost figure originates in
exactly one function in `costing_service.py`. Controllers in `costing.py`
do nothing but fetch the `Lot`, delegate, and return — no arithmetic in
the endpoint layer.

**Reuse audit (what was actually reused vs. built new):**

| Cost component | Source | New storage? |
|---|---|---|
| Fabric cost | `LotFabricIssue.issued_length_meters × FabricRoll.unit_cost_per_meter` (modules 3/4) | None |
| Accessory/thread/button/label cost | `BOMItem` (module 9's existing BOM) × actual output | None |
| Labor cost | `payroll_service.get_bundle_eligibility_ratios()` × `BundleScanEvent.amount_earned` (modules 6/12) | None — new *public* wrapper exposed on an existing private function, not a new calculation |
| Machine cost | `machine_service.get_capacity_metrics()` running hours (module 10) + `MachineMaintenanceLog.cost` | `Machine.hourly_operating_cost`, `Machine.depreciation_per_hour` (2 columns) |
| Quality cost | `QualityCheck`/`BundleReject`/`BundleRework` counts (module 11) | None |
| Packing cost | `StockLedger` rows tagged `reference_type="packing_cost"`, written via the existing `stock_service.post_stock_movement()` | None — no packing-cost table; recording is a thin wrapper around module 2's stock service |
| Overhead | Genuinely new — nothing else captures rent/admin/electricity | `OverheadCost` table |
| Costing assumptions (inspection cost/default depreciation/allocation basis) | Genuinely new | `CostingPolicy` table |

Two new tables and two new columns, against roughly a dozen cost
components. That ratio is the actual evidence for "no duplicate
calculations" — most of this module is aggregation and orchestration,
not new arithmetic.

## Schema Review

- `Machine` +2 columns (`hourly_operating_cost`, `depreciation_per_hour`) — nullable, so existing machines aren't broken; `CostingPolicy.default_machine_depreciation_per_hour` is the fallback when a specific machine has none set.
- `CostingPolicy` (company-scoped, one row per company, auto-created with defaults on first access — same pattern as `PayrollPolicy`).
- `OverheadCost` (factory-scoped): `overhead_type`, `cost_nature` (fixed/variable), `amount`, `period_start`/`period_end`.
- No `PackingCost` table, no `PlannedCost` table, no `CostSheet` snapshot table — each was considered and rejected in favor of reusing `StockLedger`, `BOM`, and on-demand computation respectively (see Architecture Review).

## API Review (`/costing`, 11 endpoints)

| Endpoint | Purpose |
|---|---|
| `GET /lots/{id}/cost-sheet` | The full cost sheet (material/labor/machine/quality/packing/overhead/total/per-piece) |
| `GET /lots/{id}/profit-analysis` | Revenue-at-catalog-price vs. manufacturing cost |
| `GET /lots/{id}/variance` | Actual vs. BOM-planned material cost |
| `POST /packing-consumption` | Records packing material use (delegates to `stock_service`) |
| `POST/GET /overheads` | Overhead cost entries |
| `GET/PUT /policy` | `CostingPolicy` |
| `GET /dashboard` | Today's production/material/labor/machine cost + profit |
| `GET /reports/operation-cost`, `/reports/employee-cost` | Aggregations over `BundleScanEvent` |

**Permissions**: `COST_VIEW_ROLES` = Super Admin/Company Admin/Accountant/
Factory Manager/Production Manager/HR. Operator and Worker roles are
excluded entirely — "Employees cannot view costing" is enforced by
`require_role()` never including those two roles on any endpoint in this
file, not by a client-side hide. Reused the existing `ACCOUNTANT` role
for "Cost Accountant" rather than adding a near-duplicate role, the same
judgment call as reusing `QUALITY` in module 11 instead of inventing
something narrower.

## Cost Calculation Review

**Labor cost — the one place this module's own honesty matters most.**
Per the instruction "Use only Approved Payroll," `get_labor_cost()`
splits every scan's eligible earning into `confirmed_labor_cost`
(employee's `SalarySlip` for that period is `APPROVED`) and
`provisional_labor_cost` (not yet approved). **Only `confirmed_labor_cost`
enters `total_cost`** in the generated cost sheet — provisional amounts
are surfaced in the response for visibility but never counted as final
cost. This means a lot's cost sheet can under-report labor cost until
payroll catches up; that's flagged in the cost sheet's own `note` field,
not hidden.

**Quality-adjusted, not double-counted.** Labor cost already excludes
rejected/unpaid-rework portions via `payroll_service.get_bundle_eligibility_ratios()`
— the exact same function payroll itself uses. Reject cost (in
`get_quality_cost()`) is a *separate* figure: the *material* value of
rejected pieces, not their labor value (which is already zeroed out on
the labor side). These don't overlap.

**What's honestly incomplete, stated per-function, not buried:**
- `get_accessory_cost()` returns `0.0` with an explicit note if no
  approved BOM exists for the style — never fabricates a number.
- `get_profit_analysis()` uses `Product.selling_price` (catalog price),
  explicitly labeled as not a realized sale price, since Sales & Dispatch
  (module 13) doesn't exist yet.
- `get_variance_analysis()` only computes **material** variance (against
  BOM, the one real planned-cost source in this schema). Labor/machine/
  overhead variance would need standard-rate baselines that don't exist;
  returns `None` with a note rather than a fabricated variance.
- Overhead allocation only has a real aggregate query for `per_piece`
  basis; `per_bundle`/`per_hour` fall back to an even split across lots
  in the period, documented as a simplification in the function's return
  value.
- Machine running-hours inherit the same hourly-scan-activity-bucket
  approximation documented in `machine_service` (module 10) — not
  continuous state tracking.

## Verification Report

| Category | Status |
|---|---|
| ✅ Static Verification | 89/89 tables in `models.py` have exactly one corresponding migration; no missing, no duplicates |
| ✅ Syntax Verification | All 80 backend files pass `ast.parse` |
| ✅ Architecture Verification | Reuse audit above confirms single-calculation-path; no function in `costing_service.py` recomputes a value another service already owns |
| ⏳ Runtime Verification | **Pending** — no live PostgreSQL available in this environment |
| ⏳ Integration Verification | **Pending** |
| ⏳ Production Validation | **Pending** |

Unit tests: `tests/test_costing_service.py` — 8 tests focused on the
zero/none-vs-fabricated-value distinction (fabric cost with no issues,
accessory cost with no BOM, labor cost split, packing cost via
`stock_service`, cost-sheet exclusion of provisional labor, variance/profit
with missing baselines) — written and syntax-verified, **never executed**.

## Migration

`0016_costing_engine.py` — 2 new `machines` columns, 2 new tables.
