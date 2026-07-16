# Database Migrations (Alembic)

As of this change, **Alembic is the single source of truth for schema
evolution**. `Base.metadata.create_all()` is no longer used on normal
startup — it only runs when `ENVIRONMENT=test`, for ephemeral test
databases that don't need migration history.

## Adopting Alembic on the existing dev database (one-time, do this first)

Your dev database was built across earlier sessions via `create_all()` —
it already has the 54 tables that `0001_baseline` represents. **Do not
run `0001_baseline` against it** (it would try to `CREATE TABLE` things
that already exist and fail). Instead, stamp it:

```bash
cd backend
alembic stamp 0001_baseline
alembic upgrade head
```

`stamp` marks the database as already being at that revision without
running any SQL. `upgrade head` then runs migrations `0002`–`0009`,
which are the actual new schema from this session (multi-tenancy,
Fabric Roll, Lot, Bundle rebuild, barcode fields, realtime events, WIP/
scan events) — these genuinely don't exist in your database yet and will
be applied for real. No data is dropped; new columns are added
nullable-first, backfilled, then constrained (see `0002_multi_tenancy.py`
for the pattern).

## Fresh / empty database

```bash
cd backend
alembic upgrade head
```

Runs all 9 migrations from scratch, building the complete current schema.

## Day-to-day workflow

**Creating a new migration** (after changing `app/models/models.py`):

```bash
# Autogenerate a draft from the model diff, then review it by hand —
# autogenerate is a starting point, not a guarantee (it won't always get
# server_defaults, enum changes, or data backfills right).
alembic revision --autogenerate -m "add employee advance table"

# Or write one from scratch (no model diff to draw from, e.g. a data-only
# migration):
alembic revision -m "backfill something"
```

Always review the generated file before committing:
- Check `upgrade()` does what you intended.
- Write `downgrade()` by hand if autogenerate left it as `pass` — every
  migration in this project has a real, working downgrade.
- Any new NOT NULL column on a table that may already have rows needs the
  nullable → backfill → `alter_column(nullable=False)` pattern shown in
  `0002_multi_tenancy.py`, not a bare `add_column(nullable=False)`.
- Any new Postgres enum type needs `.create(op.get_bind(), checkfirst=True)`
  in `upgrade()` and `.drop(op.get_bind(), checkfirst=True)` in
  `downgrade()` (see `0004_fabric_roll.py`).

**Applying migrations:**

```bash
alembic upgrade head        # apply everything pending
alembic upgrade +1          # apply just the next one
alembic upgrade <revision>  # apply up to a specific revision
```

**Rolling back:**

```bash
alembic downgrade -1            # undo the last migration
alembic downgrade <revision>    # roll back to a specific point
alembic downgrade base          # undo everything (empty schema)
```

**Checking state:**

```bash
alembic current    # what revision is the DB actually at
alembic history    # full chain, in order
alembic heads      # should print exactly one — if it prints more,
                    # someone branched migrations by mistake
```

## Startup validation

`app/main.py`'s `lifespan()` calls `_verify_alembic_version()` before the
app accepts any requests. It compares the database's `alembic_version`
against the migration scripts' head revision:

- **Match** → logs it and continues.
- **DB has no `alembic_version` at all** → refuses to start, prints the
  stamp-then-upgrade instructions above.
- **DB is behind head** → refuses to start, prints `alembic upgrade head`.
- **`ENVIRONMENT=test`** → skipped entirely (test DBs use `create_all()`
  and don't carry migration history).

This means the app will never silently run against a schema older than
what the code expects — it fails loudly at startup with the exact command
to fix it, instead of hitting confusing "column does not exist" errors
mid-request later.

## Migration chain (this session)

| Revision | Contents |
|---|---|
| `0001_baseline` | Pre-session schema, 54 tables. **Stamp, don't run**, against the existing dev DB. |
| `0002_multi_tenancy` | `factories`/`production_lines` tables; `company_id`/`factory_id` on 39 existing tables + `users`, added safely (nullable → backfill → NOT NULL). |
| `0003_masters_rate` | `operation_rates` (Rate master). |
| `0004_fabric_roll` | `fabric_rolls`, `fabric_roll_movements`, `fabric_roll_status`/`inspection_status` enums. |
| `0005_lot` | `markers`, `lots`, `lot_fabric_issues`, `lot_size_breakdowns`, `lot_status` enum (full reserve→cut→hold/cancel lifecycle). |
| `0006_bundle_rebuild` | New `bundles` columns (`lot_id`, `parent_bundle_id`, barcode fields, current-location fields); `status` converted from a plain string to the `bundle_status` enum **with existing data preserved via an explicit `USING` cast**; new `bundle_holds`/`bundle_rejects`/`bundle_reworks`/`bundle_merge_logs`/`bundle_transfer_logs` tables. |
| `0007_barcode_employee_machine` | `barcode_value`/`qr_value` on `employees` and `machines`. |
| `0008_realtime` | `realtime_events` (live dashboard write-side backbone). |
| `0009_wip_and_scan` | `bundle_scan_events` (also the payroll engine's future data source — no separate payroll schema exists yet) and `wip_ledger`. |

No separate "Audit" migration: `audit_logs` predates this session and
wasn't changed, so there's nothing to migrate for it.

## Migration Validation Phase

Before this migration chain becomes the official baseline, run the full
7-test validation protocol against a real, disposable PostgreSQL
database (this was requested explicitly and could not be executed while
writing these migrations — no Postgres, no network, and no `alembic`/
`sqlalchemy` were available in that environment):

```bash
cd backend
bash scripts/run_migration_validation.sh
```

This spins up a throwaway Postgres container (`docker-compose.validation.yml`
— separate port 55432, tmpfs-backed, never touches your real dev
database), then runs all 7 tests for real:

1. **Empty database** — `alembic upgrade head`, verifies table/index/FK/enum counts.
2. **Existing database** — upgrades from a genuinely-realized `0001_baseline` state (not stamped — actually run) with seeded data, verifies row counts unchanged and NOT NULL backfills completed.
3. **Downgrade** — `alembic downgrade base`, verifies zero tables/enums remain.
4. **Upgrade again** — confirms the chain is replayable after a full downgrade.
5. **Performance** — seeds 20,000 synthetic rows before running the multi-tenancy backfill (`0002`), times it, fails if it exceeds 30s.
6. **Integrity** — FK/unique/index counts, exact enum value verification for `bundle_status`/`lot_status`/`fabric_roll_status`, confirms `factory_id` is `NOT NULL` on floor-level tables.
7. **Application startup** — imports `_verify_alembic_version()` directly and confirms it raises when the DB is behind head and passes at head.

It writes `MIGRATION_VALIDATION_REPORT.md` at the backend root with a
pass/fail line per test plus a "Remaining Risks" section (the script
itself flags known gaps in its own coverage — e.g. TEST 2 doesn't seed a
`bundles` row, so the `status` string→enum `USING` cast isn't exercised
with real pre-existing bundle data by default).

**This report has not been generated as of this commit.** Run the script
in an environment with Docker and this project's dependencies installed,
and treat its actual output — not this document — as the source of truth
for whether the migration chain is production-ready.



**Verified without a database** (static checks, all passing):
- Every migration file parses as valid Python (`ast.parse`).
- The revision chain is linear with no gaps or branches (`0001` → `0002`
  → … → `0009`).
- Every one of the 71 tables in `app/models/models.py` is created by
  exactly one migration — no table missing, no unexpected extras.
- No column is added by more than one migration (would cause
  "column already exists" on a real run).

**NOT verified — no live database or network access was available while
writing these:**
- Actually running `alembic upgrade head` / `alembic downgrade` end to end
  against a real Postgres instance.
- Exact FK constraint ordering succeeding on the very first try (baseline
  sidesteps this by adding all foreign keys as a batch after every table
  exists — see `0001_baseline.py` — specifically to avoid circular-FK
  ordering problems like `departments.head_employee_id` ↔
  `employees.department_id`, but this hasn't been executed for real).
- Postgres version-specific enum/ALTER COLUMN syntax quirks.

**Before trusting this in production**, run it against a disposable copy
of your dev database first:

```bash
# on a COPY of your database, not the real one
alembic stamp 0001_baseline
alembic upgrade head
alembic downgrade base
alembic upgrade head
```

If that round-trip completes without errors, the chain is sound. Fix
forward (edit the specific migration that failed) rather than discarding
the chain if something breaks — most likely failure points are noted
above.
