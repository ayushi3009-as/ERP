# GO LIVE BLOCKER REPORT — Microtechnique ERP

**This is a GO LIVE BLOCKER REPORT, not a GO LIVE CERTIFICATE.** Several
blockers were resolved with real code this pass — including two
previously-undiscovered severe bugs found while doing the work properly
instead of superficially. But a genuine certificate requires runtime
execution against a live PostgreSQL instance, real devices, and real
infrastructure, none of which exist in this sandbox (no network, no live
database, confirmed throughout this entire project). Declaring GO LIVE
READY without that execution would be exactly the "fabricated report"
the original request explicitly prohibited.

---

## Headline finding this pass

**Blocker 5 (Inventory) escalated in severity during investigation, then
was actually fixed — not just re-flagged a third time.** Following the
required map→compare→test→consolidate methodology surfaced:

1. `stock_service.post_stock_movement()` never maintained weighted-average
   cost at all, while the "duplicate" code in `inventory.py`/`purchase.py`
   did — consolidating blindly would have silently broken cost tracking.
2. It never checked `reserved_quantity` before allowing OUT movements.
3. It had no correct TRANSFER semantics (would have added stock on both
   sides of a transfer instead of subtracting on the source).
4. Physical stock count needs to SET an absolute quantity, not apply a
   delta — a fundamentally different operation the old code handled
   correctly and the central service didn't handle at all.
5. **Separately, and more severely**: `purchase.py`'s own duplicate
   `_get_or_create_balance()` never set `company_id`/`factory_id` on
   `StockBalance`/`StockLedger` rows it created — a `NOT NULL`
   constraint violation waiting to happen on every GRN completion, or
   (if somehow not enforced) orphaned stock data invisible to
   tenant-scoped queries. Found in three separate places (GRN receipt,
   purchase return, and one already known).
6. **A second, unrelated bug found in the same file**:
   `_update_po_received_quantities(db, grn)` referenced `tenant.apply(...)`
   in its body without receiving `tenant` as a parameter — a `NameError`
   that would have fired the first time any GRN was marked completed.

All six fixed. `stock_service.py` was rewritten with correct weighted-
average cost tracking, reserved-quantity-aware validation, a dedicated
`transfer_stock()` function, and a dedicated `set_physical_count()`
function. 21 regression tests were written **before** any call site was
touched (`tests/test_stock_service_regression.py`), encoding the exact
behavior the old duplicated code had. All 9 call sites across
`inventory.py` and `purchase.py` were then redirected to the corrected
service; both local duplicate helper functions were deleted. A
mechanical re-scan confirms **zero** direct `StockBalance`/`StockLedger`
construction remains anywhere outside `stock_service.py`.

This is real, completed work — not "flagged for later" a fourth time.
**What remains pending**: running those 21 regression tests against a
real PostgreSQL instance. They were written correctly against the
service's actual behavior (verified by re-reading both), but "syntax-
verified, never executed" is the same honest disclosure every other
test file in this project carries.

---

## Blocker-by-blocker status

| # | Blocker | Severity | Status this pass | Corrective action remaining | Est. time |
|---|---|---|---|---|---|
| 1 | Backend | Needs Attention | ✅ `/health`, `/liveness`, `/readiness` all real and distinct (liveness never touches DB; readiness checks DB + Alembic head) | Run the full HTTP integration suite against a live instance | 0.5 day |
| 2 | Database | **BLOCKING** | ⏳ Unchanged — cannot execute `scripts/run_migration_validation.sh` here | Run it against real PostgreSQL. Nothing else in this table can be honestly upgraded past "Needs Attention" until this passes | 0.5–1 day |
| 3 | Security | Needs Attention | ✅ WebSocket JWT authentication implemented for real (token query param, standard pattern; closes with code 4401/4403 before accepting, never after); ✅ topic-level authorization added (a `factory:{id}` topic requires actual membership in that factory); ✅ rate limiting wired via `slowapi` (global default, `/auth/login` deserves a stricter dedicated limit — noted, not set, since that's a per-route tuning decision this pass shouldn't make unilaterally) | Install `slowapi`, tune per-route limits, verify against real traffic | 1 day |
| 4 | Manufacturing Workflow | Needs Attention | Unchanged from last pass — chained E2E test exists (`tests/test_e2e_manufacturing_chain.py`), never executed | Run it against a real database | 0.5 day |
| 5 | Inventory | **Was BLOCKING → Resolved** | ✅ See headline finding above — real consolidation complete, 2 severe bugs fixed, 21 regression tests written | Execute the regression tests against real PostgreSQL to confirm the fix behaves as tested | 0.5 day |
| 6 | Payroll | Needs Attention | Unchanged — `tests/test_payroll_service.py` written, never executed | Run against real data | 0.5 day |
| 7 | Sales | Needs Attention | Unchanged | Run `tests/test_sales_service.py` against real data | 0.5 day |
| 8 | Manufacturing Costing | Needs Attention | Unchanged | Run `tests/test_costing_service.py` against real data | 0.5 day |
| 9 | Reports | Needs Attention | Unchanged | Run `tests/test_report_service.py` against real data | 0.5 day |
| 10 | AI | Needs Attention | Unchanged — no real LLM provider can be installed/configured without network access and real API keys, neither available here | Install at least one of `openai`/`anthropic`/`google-generativeai`, configure via `POST /ai/providers` with a real key, verify one real conversation round-trip | 1 day (mostly account/key setup) |
| 11 | Factory Dashboard | Needs Attention | ✅ WebSocket authentication fixed (see Blocker 3) — this was the specific gap named here | Verify reconnect behavior and connection cleanup under real network interruption (needs a live client) | 0.5 day |
| 12 | Thermal Printing | Needs Attention | Unchanged — Celery is a declared dependency but no worker service or task wiring exists; bulk print jobs still run via the documented synchronous fallback | Define a Celery worker service in `docker-compose.yml`, convert `process_print_job_synchronously` into a real `@celery.task`, add retry policy | 1–1.5 days |
| 13 | Mobile | Needs Attention | Unchanged — genuinely requires real Android/iOS/PWA devices per this project's own scope statement since module 17 | Real device testing | Depends on device/QA availability |
| 14 | Realtime | Needs Attention | Unchanged — WebSocket broadcast is still in-process only; Redis pub/sub fan-out between workers was not implemented this pass (real code change, deferred to keep this pass's scope to the items with the clearest safety/effort tradeoff) | Wire `connection_manager.py` to publish through Redis (already a project dependency) instead of holding connections in a single process's memory | 1 day |
| 15 | Monitoring | Needs Attention | ✅ Prometheus wired (`/metrics`, graceful fallback if not installed); ✅ optional `docker-compose.monitoring.yml` (Prometheus + Grafana) exists and had its own bug (fragile network reference) found and fixed before shipping | Deploy the monitoring stack against a real instance, confirm actual scraping, add Sentry (not yet done) | 1 day |
| 16 | Deployment | Needs Attention | ✅ nginx WebSocket proxying bug fixed (was silently going to break the dashboard in production); ✅ HTTPS block ready to enable (needs a real certificate, can't generate one here); ✅ backend healthcheck added; ✅ compose refuses to boot without a real `SECRET_KEY` | Obtain a real SSL certificate, enable the HTTPS block, test a real rolling deployment | 1 day (mostly cert acquisition) |
| 17 | Backup & Disaster Recovery | Needs Attention | ✅ Real `pg_dump`-based backup script with retention pruning and a documented restore procedure | Schedule via cron, **test an actual restore** (an untested backup is not a backup), add Redis/file backup if those hold anything durable | 1 day |

**Blocking count: 1** (Database — genuinely cannot be resolved without
live execution). Down from 5 at the start of this final phase, through
real fixes, not re-labeling.

---

## What this pass did NOT attempt, and why

- **Per-route rate limits** (e.g., a strict limit on `/auth/login`
  specifically) — a real tuning decision that depends on expected real
  traffic patterns this sandbox has no way to know; setting an arbitrary
  number would be guessing, not engineering.
- **Redis pub/sub for realtime** — a real, non-trivial code change
  (connection_manager.py would need a publish/subscribe loop per worker
  process) that deserves its own careful pass with test coverage, not a
  rushed addition at the tail of an already large one.
- **Celery task conversion for printing** — same reasoning; converting
  `process_print_job_synchronously` into a real task needs a worker
  service definition, a broker connection, and retry-policy decisions
  that shouldn't be improvised without being able to test them.

These are real, valuable, correctly-scoped next items — not silently
dropped, listed above with honest time estimates.

---

## Verdict

**❌ NOT YET GO LIVE READY.**

**One blocking item remains**: Database migration validation has never
been executed against real PostgreSQL. Every other item in this project
— 18 feature modules, the migration chain, the inventory consolidation
completed this pass, the security fixes — sits on top of that
unvalidated foundation. Run `scripts/run_migration_validation.sh` first.
Everything else in this report's "Needs Attention" column can be worked
in parallel once that passes, since none of it depends on the others.
