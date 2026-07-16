# Module 16 — Thermal Printing & Label Management

## Lesson from Modules 14/15, applied again

Checked for `printing.py`, `labels.py`, `thermal.py` in the endpoints
directory and `print`/`label`/`thermal` in `router.py` before writing
anything. None existed — genuinely new territory this time, confirmed
before starting rather than discovered after.

## Architecture Review

**This module renders almost nothing new.** An extensive, production-
quality rendering layer already existed before this session touched it:
`utils/documents.py` (reportlab PDF generation for invoice/quotation/PO/
GRN/delivery-challan/packing-slip, with proper GST tax breakdown and
amount-in-words), `utils/excel.py`, `utils/thermal_print.py` (raw ESC/POS
byte generation for real thermal printers), and `utils/barcode.py`
(PNG label generation for bundle/lot/fabric-roll labels, built across
modules 1–4 of this session). Module 16's actual job was threefold:

1. **Fill genuine label-type gaps**: Employee ID card, Machine label,
   Warehouse label, Rack label, Carton label, Finished Goods label —
   none of these had a renderer. Added to `barcode.py`, but not as six
   separate near-copies of `generate_bundle_label`: extracted the shared
   rendering body (QR + barcode + title + two detail lines) into one
   `_generic_two_field_label()` helper once a fourth near-identical
   function was about to be pasted — "templates must be reusable" applied
   to my own new code, not just the pre-existing one.
2. **Fill genuine document-type gaps**: Production Slip, Issue/Receive
   Slip, Quality Report, Payroll Slip, Attendance Slip — none existed.
   Rather than five new near-identical PDF functions, added **one**
   reusable `generate_simple_slip_pdf()` to `documents.py` (reusing its
   existing `_build_styles`/`_company_header_block`/`_doc_info_table`/
   `_signature_block`/`_build_pdf` helpers, deliberately NOT reusing the
   GST-specific `_items_table`/`_tax_breakdown_table` since these slips
   have no tax to break down).
3. **Build what genuinely didn't exist anywhere**: `printing_service.py`
   as the single dispatcher (resolves the right ERP entity, calls the
   right existing/new renderer), `PrintHistory` (audit trail — nothing
   tracked prints before), and `PrintJob` (bulk-print queue).

**Verified, not just asserted**: every dispatched call in
`printing_service.py` to `barcode_utils`/`document_utils`/`thermal_utils`
was mechanically cross-referenced against real function definitions.
This caught two real bugs before they shipped: `GRN.order` (not
`purchase_order` — the actual relationship name) and `GRNItem.accepted_quantity`
(there is no plain `.quantity` field on that model). Both fixed
during this build, not left for a runtime `AttributeError`.

## Template Review

| New template | Covers | Reuses |
|---|---|---|
| `_generic_two_field_label()` (barcode.py) | Employee ID card, Machine, Warehouse, Rack, Carton, Finished Goods labels | The QR+barcode composition already used 3× by bundle/fabric-roll/lot labels |
| `generate_simple_slip_pdf()` (documents.py) | Production Slip, Issue Slip, Receive Slip, Quality Report, Payroll Slip, Attendance Slip | `_build_styles`, `_company_header_block`, `_doc_info_table`, `_signature_block`, `_build_pdf` |

Two new templates cover eleven previously-unsupported label/document
types combined — the ratio that actually demonstrates "no duplicate
templates," not just the claim.

## API Review

`printing.py` — 8 endpoints:

| Endpoint | Purpose |
|---|---|
| `POST /labels/print` | Render + log a label (dispatches via `render_label`) |
| `POST /documents/print` | Render + log a document (dispatches via `render_document`) |
| `GET /history` | Print history, filterable by entity |
| `POST /history/{id}/reprint` | New history row linked to the original |
| `POST /history/{id}/void` | Marks voided, blocks further reprints |
| `POST /bulk` | Creates (and optionally runs) a `PrintJob` |
| `GET /bulk/{id}` | Job status |

**Permissions**: `PRINT_ROLES` = Super Admin/Company Admin/Production
Manager/Store Manager/Sales Manager/HR/Accountant — matches the module
spec's "Owner, Admin, Production, Store, Warehouse, Sales, HR, Accounts"
using existing `UserRole` values (Store Manager covers Warehouse).

## Printing Workflow Review

**Bulk printing is real but honestly scoped.** `create_bulk_print_job()`
resolves the actual target list (e.g., every bundle in a lot) and
creates a `PrintJob` row — that part is fully real. Actual background
execution via Celery (already a project dependency) is **not wired**;
instead, `process_print_job_synchronously()` runs the same per-item
logic inline as a working fallback, so bulk printing functions today
without pretending an async task runner exists when it doesn't. A real
worker would call the identical per-item code this function already
calls — `render_label()` — so wiring Celery later means adding a task
that calls this function, not rewriting the logic.

**Reprint/void is a real state machine, not a flag flip.** Every reprint
is its **own** `PrintHistory` row (linked via `original_print_id`), so
"how many times was this label printed" is a real count, not a mutated
counter that could be reset. Voiding blocks further reprints of that
specific chain (checked, not assumed).

**Realtime**: every successful or failed print, void, and job-queue event
calls the existing `realtime_service.emit()` (module 6, broadcasting live
since module 15) — no parallel event mechanism.

## Verification Report

| Category | Status |
|---|---|
| ✅ Static Verification | 100/100 tables have exactly one migration; every dispatched call in `printing_service.py` mechanically verified against real function definitions (caught 2 real bugs, both fixed) |
| ✅ Syntax Verification | All 96 backend files pass `ast.parse` |
| ✅ Architecture Verification | Two reusable templates confirmed to cover eleven label/document types combined; bulk printing's synchronous fallback documented as real, not a stub |
| ⏳ Runtime Verification | **Pending** — no live PostgreSQL, and no physical/virtual printer available in this environment |
| ⏳ Integration Verification | **Pending** |
| ⏳ Production Validation | **Pending** |

Unit tests: `tests/test_printing_service.py` — 9 tests covering
unsupported-type rejection, missing-barcode rejection, reprint/void
state transitions, and bulk-job target resolution/failure counting —
written and syntax-verified, **never executed**.

## Migration

`0019_thermal_printing.py` — 1 new enum (`print_status`), 2 new
`warehouses` columns (barcode identity), 2 new tables (`print_history`,
`print_jobs`).
