# Module 10 — Machine Tracking

## What's genuinely new vs. computed vs. reused

Machine Master, barcode/QR, machine type, and department already existed
(module 1). This module adds:

**Stored (new tables/fields)** — because this information isn't
derivable from anything else:
- `Machine.default_operation_id`, `default_operator_id`,
  `maintenance_interval_days` — configuration, not activity.
- `MachineDowntime` — why a machine was down and for how long. `Machine.status`
  only tells you the *current* state; history needs its own table.
- `MachineMaintenanceLog` — completed maintenance events, auto-advancing
  `Machine.next_maintenance`.
- `Machine.status` upgraded from a loose `String(20)` to a proper
  `MachineStatus` enum.

**Computed at read time, deliberately NOT stored** (same principle as
Lot's computed fields in the earlier Lot/Bundle work):
- **Current bundle / current lot** — read from `WIPLedger` where
  `current_machine_id` matches, joined to `Bundle`/`Lot`.
- **Production output / efficiency** — aggregated from
  `BundleScanEvent.quantity` where `machine_id` matches, compared against
  `capacity_per_hour`. Efficiency uses a flat 8-hour-shift assumption
  since no shift-schedule model exists yet — noted as a simplification,
  not hidden.
- **Machine Timeline** — `BundleScanEvent` rows for that machine, no
  separate history table.
- **Alerts** (breakdown / maintenance due / idle-too-long) — computed on
  every call from `Machine.status`, `Machine.next_maintenance`, and
  `WIPLedger.last_event_at`. Not a stored alerts table that could go
  stale.

**Reused, not duplicated:**
- `realtime_service.emit()` for every status/downtime/maintenance event.
- `scan_service.process_scan()` now sets `Machine.status = RUNNING` when
  a scan includes a `machine_id` (a scan at a machine implies it's
  active) — this is machine_service's *only* touchpoint inside
  scan_service, added as a few lines rather than a second event pipeline.
- The same `_create_audit_log()` pattern as every other module.

## API (`/machine-tracking`)

| Method | Path | Purpose |
|---|---|---|
| PUT | `/{id}/status` | Manual status change |
| POST | `/{id}/downtime/start` | Begin a downtime record |
| POST | `/downtime/{id}/end` | Close it, duration computed |
| GET | `/{id}/downtime/history` | Full downtime log |
| POST | `/{id}/maintenance/log` | Record completed maintenance |
| GET | `/{id}/maintenance/history` | Full maintenance log |
| GET | `/{id}/current-work` | Computed — what's on this machine right now |
| GET | `/{id}/timeline` | Computed — recent scan events at this machine |
| GET | `/{id}/efficiency?date_from=&date_to=` | Computed — output vs. capacity |
| GET | `/dashboard` | Fleet-wide status counts |
| GET | `/alerts` | Computed — breakdown / maintenance-due / idle-too-long |

Machine CRUD itself (create/list/update) stays in `products.py` where it
already lived — this module only adds tracking behavior on top, per "do
not duplicate/rebuild existing modules."

## Extension: Phases A–G (capacity, allocation, health, unified timeline, fleet dashboard, reports)

Same triage discipline applied again — stored only what's genuinely not
derivable:

**Stored (new):**
- `Machine.production_line_id`, `allocation_status` (new orthogonal
  administrative-state enum — a machine can be `RUNNING` operationally
  while `ALLOCATED` administratively, these don't collide),
  `target_capacity_per_hour`, `current_capacity_per_hour` (manual
  derating input, not derivable from history).
- `MachineCapacityTarget` — explicit per-period targets (daily/weekly/
  monthly) rather than deriving them by multiplying a single rate, since
  real planning overrides for holidays/planned downtime.
- `MachineAllocationLog` — administrative allocation history (reserve/
  allocate/release/transfer/lock/unlock/decommission), distinct from
  `MachineDowntime` (why not running) and `BundleScanEvent` (what work
  passed through).
- `MachineMaintenanceLog` extended (not duplicated) with `vendor_id`,
  `running_hours_at_service`, `spare_parts` (JSON), `attachments` (JSON,
  future-ready, not wired to actual upload).

**Computed, not stored** — Phase D (Machine Health) in its entirety:
running/idle hours, breakdown count, repair count, MTBF, MTTR, and health
score are all derived from `MachineDowntime` + `MachineMaintenanceLog` +
`BundleScanEvent` at request time. Two honesty notes baked into the
service's own output (`get_capacity_metrics`/`get_health` return a `note`
field, not just numbers):
- Running/idle hours are an **hourly-scan-activity-bucket approximation**,
  not continuous state tracking — there's no `MachineStateLog` recording
  exact start/stop timestamps, only discrete scan events. Downtime hours
  ARE precise (from `MachineDowntime`).
- Health score is a **documented weighted composite** (40% efficiency +
  40% uptime + 20% minus a capped breakdown penalty), not an
  industry-standard formula — easy to retune, not presented as more
  rigorous than it is.

**Phase E (unified timeline)** merges `MachineAllocationLog` +
`BundleScanEvent` + `MachineDowntime` + `MachineMaintenanceLog`
chronologically — no new event table, just a merge query.

**Phase F (fleet dashboard)** extends the existing `get_dashboard()` with
upcoming-maintenance and live-production aggregates, and reuses
`get_alerts()`/`get_efficiency()` rather than recomputing.

**Phase G (reports)** — six report functions, all aggregation queries
over `BundleScanEvent`/`MachineDowntime`/`MachineMaintenanceLog`/
`get_capacity_metrics`. The operator report explicitly reuses the same
`BundleScanEvent` source module 12's payroll engine will read from, "so
this report and payroll can never disagree" by construction.

### New endpoints (`/machine-tracking`, 31 total now)

Capacity: `POST /{id}/capacity-target`, `GET /{id}/capacity-achievement`, `GET /{id}/capacity-metrics`
Allocation: `POST /{id}/reserve|allocate|release|transfer|lock|unlock|decommission`
Health: `GET /{id}/health`
Timeline: `GET /{id}/unified-timeline`
Fleet: `GET /fleet-dashboard`, `GET /performance-ranking`
Reports: `GET /reports/production|efficiency|downtime|maintenance|operator|utilization`

### Migration

`0012_machine_tracking_extension` — new enum, 4 new `machines` columns, 4
new `machine_maintenance_logs` columns, 2 new tables.

### Verification status (extension)

| Category | Performed? |
|---|---|
| Static verification | ✅ 76/76 tables, one migration each |
| Syntax verification | ✅ all 70 backend files pass `ast.parse` |
| Architecture verification (self-reviewed) | ✅ `log_maintenance` extended in place rather than duplicated; `get_efficiency`/`get_dashboard`/`get_alerts` reused by the new fleet/health/report functions rather than reimplemented |
| Runtime verification | ⏳ Pending — blocked on the migration validation harness |
| Integration verification | ⏳ Pending |
| Production validation | ⏳ Pending |

Additional unit tests: `tests/test_machine_service.py` extended with 14
more tests covering capacity targets, the allocation state machine, and
health computation — written and syntax-verified, **never executed**.

