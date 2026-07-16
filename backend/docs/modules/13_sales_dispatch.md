# Module 13 — Sales & Dispatch

## Architecture Review

**What already existed vs. what's new.** `Quotation`, `SalesOrder`,
`DeliveryChallan`, `SalesInvoice` (with GST fields already computed) and
a 2165-line `sales.py` with full CRUD predate this session. Two real
problems with that existing code, fixed as part of this module (same
pattern as `quality.py`/`payroll.py` before it):

1. **Never tenant-scoped** — all 21 endpoints, fixed via the same
   scripted retrofit used throughout this project (signatures, list
   queries, create-stamps, fetch-by-id, payload-driven `Product`/
   `Customer` validation lookups — 9 additional cross-tenant-reference
   points closed).
2. **`create_sales_return` directly decremented `SalesInvoice.paid_amount`**
   — not real accounting (a return means a credit is owed, not that less
   was paid). Replaced with `sales_service.process_sales_return()`,
   which creates a proper `SalesReturn` + `CreditDebitNote`.

**New business logic lives only in `sales_service.py`** — `sales.py`'s
existing CRUD stays as-is (already thin-ish, GST math already correct),
and the new `sales_dispatch.py` endpoint file is fully thin, delegating
every operation to `sales_service`.

## Schema Review

**Extended in place (no duplication):**
- `Customer`: `shipping_address`, `country`, `payment_terms`.
- `DeliveryChallan`: `dispatch_status` (new enum, separate from the
  existing `status`/`DocumentStatus` — one tracks the *document*
  lifecycle, the other tracks the *physical* dispatch), `driver_name`/
  `driver_phone`/`lr_number`/`courier_name`/`tracking_number`/
  `estimated_delivery`/`actual_delivery`/`is_partial_dispatch`.
- `DeliveryChallanItem`, `SalesInvoiceItem`: `bundle_id` (+`lot_id` on
  the invoice item) — this is the traceability chain back to Lot/Bundle/
  Production Order the module asked for, added as columns rather than a
  separate traceability table.

**Genuinely new tables:**
`CustomerPriceListItem`, `FinishedGoodsAllocation`, `PackingList` +
`PackingCarton` + `PackingCartonBundle`, `SalesReturn`,
`CreditDebitNote`, `Payment`.

**Deliberately NOT created:** a `CustomerLedger` table. Outstanding
balance and ledger history are computed on every call from
`SalesInvoice.grand_total` + `Payment.amount` + `CreditDebitNote` —
storing a running balance would let it drift from what actually
happened; the three source tables already can't disagree with each other.

## API Review

`sales.py` (existing, now tenant-scoped): quotations/orders/challans/
invoices CRUD, `POST /returns` (now delegates to `sales_service`).

`sales_dispatch.py` (new, 16 endpoints, fully thin):

| Area | Endpoints |
|---|---|
| Price List | `POST /price-list`, `GET /price-list/resolve` |
| FG Allocation | `POST /allocate`, `POST /allocations/{id}/release` |
| Packing | `POST /packing-lists`, `POST /packing-lists/{id}/cartons`, `POST /cartons/{id}/map-bundle`, `POST /packing-lists/{id}/verify` |
| Dispatch | `POST /challans/{id}/scan`, `POST /challans/{id}/complete-dispatch` |
| Payments | `POST /payments` |
| Ledger | `GET /customers/{id}/ledger` |
| Profit | `GET /invoices/{id}/profit` (reuses `costing_service`) |
| Dashboard/Reports | `GET /dashboard`, `/reports/customer-wise`, `/reports/product-wise` |

**Permissions**: reused existing roles rather than inventing "Dispatch
Manager"/"Customer Support" — `SALES_MANAGER` + `STORE_MANAGER` cover
dispatch/warehouse actions, `ACCOUNTANT` covers payments/ledger/profit.
Operator/Worker roles appear in **no** role list in either sales file —
"customers see only their own orders" is explicitly out of scope until a
customer portal exists, per the module's own spec.

## Sales Workflow Review

**Finished Goods Allocation (FIFO + quality-gated)**:
`allocate_finished_goods()` orders candidate bundles by `created_at` ASC
(FIFO), filters to `current_stage` at PACKING or later (**never WIP**),
and — critically — checks each bundle's *latest* `QualityCheck` result is
`PASS` before allocating it. This is the exact same gate `quality_service.check_gate_approval()`
enforces before a bundle can even reach PACKING (module 11); allocation
adds a second, independent check at the sales layer rather than trusting
that the production-side gate was never bypassed. Insufficient
quality-approved stock produces a `BACK_ORDER` allocation, not a
fabricated success.

**Barcode-gated dispatch**: `dispatch_by_barcode_scan()` resolves the
scanned code via `barcode_service.resolve_prefix()` (bundle) or an
explicit `"CTN-"` prefix check (carton — cartons aren't in
`barcode_service`'s entity registry since they're packing-list children,
not top-level scannable masters). Validates: bundle not already
dispatched (duplicate-dispatch prevention via a direct query, not a
flag), bundle is allocated to *this* sales order specifically (not just
allocated to *someone*), and the same sales order as the challan.
Scanning a carton recursively dispatches every bundle mapped into it.

**Cost & profit**: `get_invoice_profit()` calls
`costing_service.generate_cost_sheet()` per distinct `lot_id` referenced
by the invoice's line items — manufacturing cost is never recomputed
here. An invoice with no lot-linked items returns `None` for profit with
an explicit note, not a fabricated zero.

## Verification Report

| Category | Status |
|---|---|
| ✅ Static Verification | 97/97 tables in `models.py` have exactly one migration; no missing, no duplicates |
| ✅ Syntax Verification | All 84 backend files pass `ast.parse` |
| ✅ Architecture Verification | Reuse confirmed: FG allocation reuses `QualityCheck`, dispatch reuses `barcode_service`, profit reuses `costing_service`, ledger computed from existing tables rather than stored redundantly |
| ⏳ Runtime Verification | **Pending** — no live PostgreSQL available in this environment |
| ⏳ Integration Verification | **Pending** |
| ⏳ Production Validation | **Pending** |

Unit tests: `tests/test_sales_service.py` — 10 tests covering the
quality-gate on allocation, duplicate-dispatch prevention logic paths,
payment validation, ledger computation, price-list precedence, and
return-quantity/disposition validation — written and syntax-verified,
**never executed**.

## Migration

`0017_sales_dispatch.py` — 2 new enums, 3 extended tables (`customers`,
`delivery_challans`, +traceability columns on 2 item tables), 7 new
tables.
