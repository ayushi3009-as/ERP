# Module 11 — Quality Control

## What already existed, what's genuinely new, and the key integration decision

`QualityCheck` (with `QCType`/`QCResult` enums) and a working `quality.py`
CRUD already existed **before this session** — general-purpose
incoming/in-process/final inspection records. Two real problems with it,
fixed as part of this module rather than left alone:

1. **It was never tenant-scoped** — no `company_id`/`factory_id`
   filtering anywhere. Fixed: every endpoint now goes through
   `TenantContext`, same as every other module.
2. **All its business logic lived inline in the endpoints** — QC-number
   generation, pass/fail/rework determination — violating the
   "controllers validate, service decides" rule everything else in this
   project follows. Extracted into `quality_service.py`.

**The key integration decision**: `bundle_service.py` already has
`reject_bundle()`/`start_rework()`/`complete_rework()` from the Bundle
Management work. Module 11 does **not** reimplement bundle-level
rejection or rework — `quality_service.inspect_bundle()` creates the
formal `QualityCheck` paper trail (with defect categorization) and then
*calls* `bundle_service.reject_bundle()`/`start_rework()` for the actual
state change. One test (`test_inspect_bundle_partial_reject_delegates_to_bundle_service`)
exists specifically to confirm this delegation happens rather than a
parallel reimplementation.

## Genuinely new

- **`DefectCategory`** — a real defect taxonomy. Previously reject/QC
  reasons were free text on both `QualityCheck.defect_description` and
  `BundleReject.reason`. Both tables now have an optional
  `defect_category_id` link (extended in place, not duplicated).
- **QC barcode identity** — `QualityCheck` gets `barcode_value`/
  `qr_value` via the existing `barcode_service.generate_for()` (new
  `"quality_check"` entity prefix registered, not a new minting
  mechanism).
- **`QUALITY` role** — the original architecture's permissions matrix
  already listed a Quality role; it never actually existed in `UserRole`.
  Added, with its own `INSPECT_ROLES` (manager roles + `QUALITY`) so
  inspectors don't need full production-manager rights to log
  inspections.

## Computed, not stored

- **Quality Dashboard** — unifies order/incoming/final-level
  `QualityCheck` pass/fail/rework rates with bundle-level
  `BundleReject`/`BundleRework` counts. Reads both, stores neither twice.
- **Reports** (defect analysis, inspector performance) — aggregation
  queries over `QualityCheck`, grouped by defect category / inspector.

## API (`/quality`)

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/defect-categories` | Defect taxonomy master |
| GET | `/summary` | Existing pass/fail/rework summary |
| GET | `/`, `/{id}` | Existing QC list/get |
| POST | `/` | Create a general QC record |
| PUT | `/{id}` | Update a QC record |
| POST | `/inspect-bundle` | **New** — bundle-specific inspection, delegates fail/rework to `bundle_service` |
| GET | `/dashboard` | **New** — unified QC + bundle-level dashboard |
| GET | `/reports/defect-analysis`, `/reports/inspector-performance` | **New** |

## Migration

`0013_quality_control.py` — includes one thing worth reading carefully:
adding `'quality'` to the existing `user_role` Postgres enum. `ALTER TYPE
... ADD VALUE` cannot run inside a transaction block on some Postgres
versions; the migration issues an explicit `COMMIT` first as a
safeguard, but this specific statement **has not been executed against a
real Postgres instance** (same blanket caveat as every migration in this
project — see `docs/MIGRATIONS.md`). If it fails in your environment, run
the `ALTER TYPE` statement manually once and `alembic stamp` past this
revision rather than silently skipping it.

## Extension: Phases A–H (standards, measurements, photos, gates, CAPA, KPIs, alerts, reports)

**Genuinely new storage:**
- `QualityStandard` — reusable inspection standard (product category/
  item/design/operation/customer, tolerance notes, checklist, sampling
  rules). "Buyer" is Customer, per the same reasoning documented on the
  `Lot` model — not a separate entity in this schema.
- `MeasurementPoint` (master: chest/length/shoulder/...) +
  `MeasurementRecord` (per-inspection actual vs. specified/tolerance,
  pass/fail computed at record time). Measurement *history* per Phase B
  is just querying these records — no separate history table.
- `QualityPhoto` — metadata only (`photo_url`/`file_name`/`content_type`),
  explicitly not wired to real object storage per Phase C's own framing
  ("future-ready").
- `CAPARecord` — root cause / corrective / preventive action, responsible
  employee, target/closure dates, status.

**The most consequential piece — Phase D (Quality Gates) — is an
enforcement change, not new storage.** `quality_service.check_gate_approval()`
is called from `scan_service.process_scan()` **before** a stage
transition into `PACKING`/`FINISHED`/`DISPATCH` is committed. If the
bundle has no `QualityCheck` on record, or its latest one didn't pass,
the scan is rejected with a specific reason. This is a real behavior
change to the barcode scan workflow built in module 6 — bundles that
previously moved through those stages freely will now be blocked without
a prior passing inspection. Four tests exist specifically for this gate
(blocks-with-no-inspection, blocks-with-failed-inspection, allows-with-
passed-inspection, doesn't-apply-to-ungated-stages).

**Computed, not stored — Phase F (KPIs) in its entirety**, with two
caveats stated in the function's own return payload rather than only in
code comments:
- `machine_quality_scores_approx` joins through `WIPLedger.current_machine_id`
  — the bundle's *current* machine, not necessarily the machine it was on
  at the moment of the defect. No historical per-scan machine-at-defect
  table exists.
- `customer_return_pct` is always `None` — there's no Sales & Dispatch
  (module 13) data yet to compute it from. Returning `None` explicitly
  rather than fabricating a number.
- Inspector scores are labeled "pass rate," not "accuracy" — true
  accuracy would need ground-truth re-audit data that doesn't exist.

**Phase G (alerts)** reuses `compute_kpis()` and `get_overdue_capas()`
rather than recomputing reject rates separately.

**Phase H (reports)**: `report_pareto()` reuses `report_defect_analysis()`
and adds cumulative % on top rather than re-querying;
`report_customer_complaint()` is an honest placeholder (module 13
dependency, explicit in its own response, not silently empty).

### New endpoints (`/quality`, 30 total now)

Standards: `GET/POST /standards`
Measurements: `GET/POST /measurement-points`, `POST /{id}/measurements`, `GET /measurements/history`
Photos: `POST/GET /{id}/photos`
CAPA: `POST /capa`, `POST /capa/{id}/close`, `GET /capa/overdue`
KPIs: `GET /kpis`
Alerts: `GET /alerts`
Reports: `GET /reports/defect-trend|pareto|heatmap|capa|customer-complaint|monthly-summary`

### Migration

`0014_quality_control_extension` — new `capa_status` enum, 5 new tables,
1 new column on `quality_checks`.

### Verification status (extension)

| Category | Performed? |
|---|---|
| Static verification | ✅ 82/82 tables, one migration each |
| Syntax verification | ✅ all 74 backend files pass `ast.parse` |
| Architecture verification (self-reviewed) | ✅ gate enforcement added to `scan_service` as a single delegated call, not a parallel workflow-state machine; `report_pareto` reuses `report_defect_analysis` rather than re-querying |
| Runtime verification | ⏳ Pending |
| Integration verification | ⏳ Pending |
| Production validation | ⏳ Pending |

Additional unit tests: `tests/test_quality_service.py` now 23 tests total
(9 base + 14 extension, including the 4 gate tests), written and
syntax-verified, **never executed**.

