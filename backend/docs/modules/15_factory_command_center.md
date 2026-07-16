# Module 15 — Factory Command Center

## Lesson from Module 14, applied this time

Before writing anything, checked `router.py` for an existing
`dashboard.py` registration — found one (a genuine pre-session file, 3
endpoints at `/dashboard`). This module's new work went to
`command_center.py`, mounted at `/command-center`, leaving `/dashboard`
completely untouched. No recovery needed this time because the check
happened first.

## Architecture Review

**Facade over 6 existing services**, same discipline as module 14's
`report_service.py`: `dashboard_service.py`'s per-domain widget functions
(`machine_summary`, `quality_summary`, `inventory_summary`,
`sales_summary`, `payroll_summary`, `costing_summary`) call
`machine_service.get_fleet_dashboard()`, `quality_service.get_quality_dashboard()`,
`report_service.finished_goods_report()`/`warehouse_report()`/
`slow_moving_inventory()`, `sales_service.get_sales_dashboard()`,
`payroll_service.get_payroll_dashboard()`, `costing_service.get_costing_dashboard()`
directly. Verified mechanically (not just `ast.parse`): every
cross-service call in `dashboard_service.py` was checked against actual
function definitions — 15 calls across 6 services, all resolve.

**Genuinely new**:
- **WebSocket transport** (`connection_manager.py`) — nothing in this
  codebase had one before. `realtime_service.emit()` (module 6) already
  wrote `RealtimeEvent` rows and had a `# TODO(module 14): broadcast...`
  comment (written under this session's earlier module-numbering, before
  Reports became module 14) — this module implements that TODO.
- **Alert Center** — merges `machine_service.get_alerts()` +
  `quality_service.get_quality_alerts()` + `quality_service.get_overdue_capas()`
  (all pre-existing) plus one new thin low-stock check, tagging each with
  a `domain` field. No alert is computed twice.
- **Live Production Feed** — the factory-wide version of
  `machine_service.get_unified_timeline()`'s per-machine merge pattern
  (`BundleScanEvent` + `MachineDowntime`), scoped to the whole factory.
- **Employee productivity ranking** and **production-by-hour/department/
  operation** — nothing else in this schema ranks employees by output or
  buckets production by hour; both are new aggregation queries, not new
  storage.
- **`current_shift` is explicitly `None`** — no Shift master exists
  anywhere in this schema (a gap already noted in the Payroll module's
  own docs). Returning `None` here rather than fabricating a shift
  matches the pattern used throughout this project for missing baselines.

## API Review

`command_center.py` — 18 endpoints (17 HTTP + 1 WebSocket):

| Area | Endpoints |
|---|---|
| Overview | `/overview` |
| Production | `/production/by-hour`, `/by-department`, `/by-operation`, `/target-vs-achievement` |
| Employee | `/employee/overview`, `/employee/productivity-ranking`, `/employee/{id}/current-work` |
| Domain widgets | `/machine`, `/quality`, `/inventory`, `/sales`, `/payroll`, `/costing` |
| Alerts/feed | `/alerts`, `/live-feed` |
| Snapshot | `/snapshot` (everything above, one call) |
| Realtime | `WS /ws/{topic}` |

**Permissions**: `FLOOR_VIEW` (includes Operator/Worker) gates only the
floor-facing widgets (overview, employee overview, current-work,
production-by-hour, live-feed) — payroll and costing are gated to
`SENSITIVE_VIEW` (Super Admin/Company Admin/Accountant only), matching
the restriction already established in modules 12/12.5.

## Performance Review

- No new caching, no materialized views — every widget queries live
  tables or calls an existing service's own (already-aggregating)
  function. Not load-tested (no live database in this environment).
- `command_center_snapshot()` makes ~10 calls into other services
  sequentially — the most likely place to need `asyncio.gather`-style
  parallelization or targeted caching if profiling at the "1000
  concurrent dashboard users" scale the module asks for shows it's slow;
  not attempted here without a profiler to justify it, per the explicit
  "profile before introducing caches" instruction.
- The WebSocket layer avoids polling entirely for live updates once
  connected — the performance question for *that* path is connection
  count per process, not query load.

## Realtime Review

**How it actually works**: `realtime_service.emit()` (called from every
service that mutates state — scan, quality, machine, payroll, etc.)
now does two things in one call: persists the `RealtimeEvent` row (as
before) and calls `connection_manager.manager.broadcast_sync()`, which
schedules an async WebSocket send via `asyncio.run_coroutine_threadsafe`
onto the event loop captured at startup (`main.py`'s `lifespan`). Two
topics per event: `factory:{factory_id}` (the dashboard-wide feed) and
`{entity_type}:{entity_id}` (e.g. a single bundle's detail view).

**Stated scope boundary, not hidden**: this is an **in-process**
connection registry. It broadcasts correctly to every WebSocket
connected to the server process handling the request. It does **not**
fan out across multiple worker processes or machines — a multi-worker
production deployment needs Redis pub/sub (already a project dependency
per `requirements.txt`) between processes, which is not wired here.

**Also stated plainly**: the WebSocket endpoint itself
(`GET /command-center/ws/{topic}`) has no authentication wired yet.
FastAPI's `Depends()`-based auth flow doesn't attach the same way to
WebSocket routes as HTTP ones; this needs a token-in-query-param or
subprotocol handshake before it's production-safe, and is flagged as a
concrete next step rather than silently assumed secure.

## Verification Report

| Category | Status |
|---|---|
| ✅ Static Verification | 98/98 tables unchanged — this module needed zero new tables (`RealtimeEvent` already existed); every cross-service call in `dashboard_service.py` (15) and `command_center.py` (17) mechanically verified against real function definitions |
| ✅ Syntax Verification | All 92 backend files pass `ast.parse` |
| ✅ Architecture Verification | Facade pattern confirmed for 6 domain widgets; WebSocket broadcast added to the single existing `emit()` call site rather than a parallel event path |
| ⏳ Runtime Verification | **Pending** — no live PostgreSQL, and no running server process to actually test a WebSocket connection, in this environment |
| ⏳ Integration Verification | **Pending** |
| ⏳ Production Validation | **Pending** |

Unit tests: `tests/test_dashboard_service.py` — 9 tests, including one
confirming `broadcast_sync()` no-ops safely before the event loop is
captured (rather than crashing every caller in a test/import context),
and one confirming the live feed's chronological merge/sort — written
and syntax-verified, **never executed**.

## Migration

None. This module reuses `RealtimeEvent` (module 6) and needed no new
tables — consistent with "no duplicate reporting/event tables."
