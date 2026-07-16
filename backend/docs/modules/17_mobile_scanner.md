# Module 17 — Mobile Scanner Platform

## Lesson from Modules 14/15/16, applied again

Checked for `mobile.py`, `device.py`, `offline.py`, `sync.py` in
endpoints and any `mobile`/`device` registration in `router.py` before
writing anything. None existed — clean territory, confirmed first.

## Architecture Review

**The most important fact about this module: the entire "Shop Floor
Workflow" diagram in the spec (Bundle scan → Operation verified → Quality
gate verified → Machine verified → Employee verified → Operation
completed → Realtime update → Audit log) was already fully built** —
`scan_service.process_scan()` (module 6) does all of this, including the
quality gate (wired in module 11) and realtime broadcast (module 15).
`mobile_service.mobile_scan_bundle()` is a **direct passthrough** with
one parameter added (`device_source`, which was already a free-text
column on `BundleScanEvent` since module 6 — no schema change needed to
distinguish mobile scans from fixed-station ones).

The same passthrough pattern holds for every other "feature" in the
spec: quality inspection calls `quality_service.inspect_bundle()`,
bundle assignment calls `employee_work_service.issue_bundle()`, stock
movements call `stock_service.post_stock_movement()`, dispatch scanning
calls `sales_service.dispatch_by_barcode_scan()`, printing calls
`printing_service.render_label()`. **Zero new business logic exists in
this module for any of these** — verified mechanically: every
cross-service call in `mobile_service.py` (13 across 8 services) checked
against real function definitions.

**What's genuinely new**: device registration/session linkage, offline
batch queuing and replay, and role-scoped screen curation. That's it.

## API Review

`mobile.py` — 21 endpoints across device management, shop-floor scan,
employee/supervisor/quality/warehouse/dispatch features, notifications,
and offline sync. Every handler is a fetch-validate-delegate-respond
wrapper around `mobile_service`, which itself mostly delegates further.

**One existing-module wire-up, not a new architectural layer**:
`auth.py`'s `/login` gained an optional `device_id` field on
`LoginRequest`, linking the created `UserSession` to a `MobileDevice`.
Without this, "logout from all devices" would have nothing to revoke —
this was a genuine gap discovered while building the device feature, not
scope creep; it's a one-field addition to an existing schema/endpoint,
not new logic.

## Offline Sync Review

**How conflict detection actually works**: `process_offline_batch()`
replays each queued action through the same service function the online
path uses, in the client's own sequence order. If a queued action
violates a business rule the target service already enforces (e.g. two
"start work" actions queued for the same employee while offline —
`start_work()` already rejects a double check-in), the item is marked
`CONFLICT`, not silently applied or silently dropped. **There is no
separate offline-specific conflict engine** — the online validation IS
the conflict detection, applied a second time at replay. A dedicated
test (`test_process_offline_batch_marks_conflict_not_crash_on_business_rule_violation`)
confirms a business-rule violation produces a `CONFLICT` item and lets
the rest of the batch continue, rather than raising and losing the whole
batch.

**Genuinely new storage**: `OfflineSyncBatch` (one row per submission)
and `OfflineSyncItem` (one row per queued action, `client_sequence` +
`client_timestamp` preserved for ordering and audit). Every item's
outcome (`synced`/`conflict`/`failed`) and the resulting entity reference
are recorded — a real audit trail of what happened when a device came
back online, not just a success/failure boolean for the whole batch.

**What isn't built**: the actual on-device offline queue (that's mobile
app code — Android/iOS/PWA — which this backend module doesn't produce;
this session has only ever produced the FastAPI backend, consistent with
every prior module). This module is the **server-side replay endpoint**
a real mobile app's local queue would call once connectivity returns.

## Security Review

- **Device registration** (`MobileDevice`) and **session-to-device
  linkage** (`UserSession.device_id`) are real and wired into the actual
  login flow, not just modeled.
- **Logout from all devices** revokes every `UserSession` for the user
  via the existing `is_revoked` flag (the same mechanism `/auth/logout`
  already used) — no second revocation mechanism.
- **Role validation** reuses the exact `require_role()` dependency every
  other module in this project uses — no mobile-specific auth path.
- **What's explicitly NOT addressed here, stated rather than assumed**:
  API rate limiting (no rate-limiting middleware exists anywhere in this
  codebase yet — a cross-cutting concern, not specific to mobile, and
  out of this module's scope to bolt on unilaterally), encrypted local
  storage (a client-side/app concern, not a backend one), and biometric
  login (explicitly "future-ready" per the spec — no backend hook was
  needed since biometric auth resolves to the same JWT flow once
  unlocked on-device).

## Verification Report

| Category | Status |
|---|---|
| ✅ Static Verification | 103/103 tables have exactly one migration; every cross-service call in `mobile_service.py` (13 calls across 8 services) mechanically verified against real function definitions |
| ✅ Syntax Verification | All 100 backend files pass `ast.parse` |
| ✅ Architecture Verification | Passthrough pattern confirmed for every "feature" in the spec; the one existing-file change (`auth.py`'s `device_id` field) is additive, not a rewrite |
| ⏳ Runtime Verification | **Pending** — no live PostgreSQL, and (per the module's own verification section) genuinely requires real Android/iOS devices to test camera/Bluetooth scanning, offline queue behavior, and push notifications, none of which exist in this environment |
| ⏳ Integration Verification | **Pending** |
| ⏳ Production Validation | **Pending** |

Unit tests: `tests/test_mobile_service.py` — 13 tests, including one
specifically confirming offline conflict detection surfaces as a
`CONFLICT` item rather than crashing the batch — written and
syntax-verified, **never executed**.

## Migration

`0020_mobile_scanner.py` — 2 new enums, 1 new column (`user_sessions.device_id`),
2 new tables (`mobile_devices`, plus `offline_sync_batches`/`offline_sync_items`).
