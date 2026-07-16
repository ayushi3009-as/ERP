#!/usr/bin/env python3
"""
Migration Validation Harness — runs the 7-test protocol against a real,
disposable PostgreSQL database and writes MIGRATION_VALIDATION_REPORT.md.

This exists because the environment that WROTE the migrations (this
session) had no PostgreSQL, no network, and no alembic/sqlalchemy
installed — none of the 7 tests could be executed there. This script is
what actually runs them, for real, wherever it's invoked with a real DB
available (see scripts/run_migration_validation.sh).

Usage:
    cd backend
    bash scripts/run_migration_validation.sh

Do NOT point DATABASE_URL at your real dev database when running this —
it drops and recreates schema repeatedly. Use the disposable container in
docker-compose.validation.yml (the run script does this for you).
"""
import os
import sys
import time
import subprocess
import traceback
from datetime import datetime

DB_URL = os.environ.get(
    "VALIDATION_DATABASE_URL",
    "postgresql://microerp:microerp@localhost:55432/microerp_validation",
)

EXPECTED_TABLE_COUNT = 71
EXPECTED_ENUMS = [
    "user_role", "gender", "document_status", "payment_status",
    "stock_movement_type", "production_stage", "qc_type", "qc_result",
    "attendance_status", "fabric_roll_status", "inspection_status",
    "lot_status", "bundle_status",
]

results = {}  # test_name -> {"status": "PASS"/"FAIL"/"SKIP", "detail": str, "duration_s": float}
risks = []


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def record(test, status, detail, duration=None):
    results[test] = {"status": status, "detail": detail, "duration_s": duration}
    marker = {"PASS": "✓", "FAIL": "✗", "SKIP": "○"}[status]
    log(f"{marker} {test}: {detail}")


def run_alembic(*args, env_extra=None, cwd=None):
    env = os.environ.copy()
    env["DATABASE_URL"] = DB_URL
    if env_extra:
        env.update(env_extra)
    cwd = cwd or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    proc = subprocess.run(
        ["alembic"] + list(args), cwd=cwd, env=env,
        capture_output=True, text=True, timeout=300,
    )
    return proc


def get_engine():
    from sqlalchemy import create_engine
    return create_engine(DB_URL)


def reset_database():
    """Drops and recreates the public schema — full clean slate."""
    from sqlalchemy import create_engine, text
    engine = create_engine(DB_URL)
    with engine.connect() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
        conn.commit()
    engine.dispose()


# ==================== TEST 1: Empty Database ====================


def test1_empty_database():
    test = "TEST 1: Empty Database (alembic upgrade head)"
    try:
        reset_database()
        start = time.time()
        proc = run_alembic("upgrade", "head")
        duration = time.time() - start

        if proc.returncode != 0:
            record(test, "FAIL", f"alembic upgrade head failed:\n{proc.stderr[-2000:]}", duration)
            return False

        from sqlalchemy import create_engine, inspect, text
        engine = create_engine(DB_URL)
        insp = inspect(engine)
        tables = insp.get_table_names()

        issues = []
        if len(tables) != EXPECTED_TABLE_COUNT:
            issues.append(f"expected {EXPECTED_TABLE_COUNT} tables, found {len(tables)}")

        # enums
        with engine.connect() as conn:
            enum_rows = conn.execute(text(
                "SELECT typname FROM pg_type WHERE typtype = 'e' ORDER BY typname"
            )).fetchall()
        found_enums = sorted(r[0] for r in enum_rows)
        missing_enums = set(EXPECTED_ENUMS) - set(found_enums)
        if missing_enums:
            issues.append(f"missing enums: {missing_enums}")

        # FK count sanity (baseline 144 + incrementals; just check > 0 and no orphaned refs)
        with engine.connect() as conn:
            fk_count = conn.execute(text(
                "SELECT count(*) FROM information_schema.table_constraints "
                "WHERE constraint_type = 'FOREIGN KEY'"
            )).scalar()
        if fk_count < 100:
            issues.append(f"suspiciously few foreign keys: {fk_count}")

        # index count
        with engine.connect() as conn:
            idx_count = conn.execute(text(
                "SELECT count(*) FROM pg_indexes WHERE schemaname = 'public'"
            )).scalar()

        engine.dispose()

        if issues:
            record(test, "FAIL", "; ".join(issues), duration)
            return False

        record(
            test, "PASS",
            f"{len(tables)} tables, {len(found_enums)} enums, {fk_count} FKs, {idx_count} indexes — all created",
            duration,
        )
        return True
    except Exception as exc:
        record(test, "FAIL", f"{type(exc).__name__}: {exc}\n{traceback.format_exc()[-1500:]}")
        return False


# ==================== TEST 2: Existing (older) Database ====================


def test2_existing_database():
    test = "TEST 2: Existing Database (upgrade from baseline, data preserved)"
    try:
        reset_database()

        # Bring the DB to the pre-session (baseline) state for real, so we
        # have a genuine "older version" to upgrade from.
        proc = run_alembic("upgrade", "0001_baseline")
        if proc.returncode != 0:
            record(test, "FAIL", f"could not reach baseline: {proc.stderr[-1000:]}")
            return False

        from sqlalchemy import create_engine, text
        engine = create_engine(DB_URL)

        # Seed representative pre-session data
        with engine.connect() as conn:
            conn.execute(text(
                "INSERT INTO users (email, username, password_hash, full_name, role) "
                "VALUES ('validate@test.com', 'validate_user', 'x', 'Validation User', 'super_admin')"
            ))
            conn.execute(text(
                "INSERT INTO companies (name, short_name, country, currency, "
                "financial_year_start, financial_year_end) "
                "VALUES ('Test Co', 'TCO', 'India', 'INR', '04-01', '03-31')"
            ))
            conn.execute(text(
                "INSERT INTO customers (code, name) VALUES ('CUST001', 'Test Customer')"
            ))
            conn.execute(text(
                "INSERT INTO employees (code, full_name, date_of_joining) "
                "VALUES ('EMP001', 'Test Employee', '2024-01-01')"
            ))
            conn.commit()

        pre_counts = {}
        with engine.connect() as conn:
            for t in ("users", "companies", "customers", "employees"):
                pre_counts[t] = conn.execute(text(f"SELECT count(*) FROM {t}")).scalar()
        engine.dispose()

        start = time.time()
        proc = run_alembic("upgrade", "head")
        duration = time.time() - start
        if proc.returncode != 0:
            record(test, "FAIL", f"upgrade to head failed: {proc.stderr[-2000:]}", duration)
            return False

        engine = create_engine(DB_URL)
        issues = []
        with engine.connect() as conn:
            for t, pre in pre_counts.items():
                post = conn.execute(text(f"SELECT count(*) FROM {t}")).scalar()
                if post != pre:
                    issues.append(f"{t}: row count changed {pre} -> {post} (DATA LOSS)")

            # nullable -> NOT NULL: every customer/employee row must now have company_id set
            null_company = conn.execute(text(
                "SELECT count(*) FROM customers WHERE company_id IS NULL"
            )).scalar()
            if null_company > 0:
                issues.append(f"{null_company} customers rows have NULL company_id after backfill")

            null_factory = conn.execute(text(
                "SELECT count(*) FROM employees WHERE factory_id IS NULL"
            )).scalar()
            if null_factory > 0:
                issues.append(f"{null_factory} employees rows have NULL factory_id after backfill")

            # bundle_status enum: pre-existing string data should have survived the type change
            # (no bundles were seeded above in this minimal run — noted as a gap, see risks)

            # duplicate index check
            dupe_idx = conn.execute(text(
                """
                SELECT indexname, count(*) FROM pg_indexes
                WHERE schemaname='public' GROUP BY indexname HAVING count(*) > 1
                """
            )).fetchall()
            if dupe_idx:
                issues.append(f"duplicate index names: {dupe_idx}")

        engine.dispose()

        if issues:
            record(test, "FAIL", "; ".join(issues), duration)
            return False

        record(test, "PASS", f"data preserved across all seeded tables, backfill complete, no dupe indexes", duration)
        risks.append(
            "TEST 2 only seeded users/companies/customers/employees, not bundles/production_orders "
            "(those need more FK setup) — the bundles.status String->Enum USING-cast conversion "
            "was NOT exercised with real pre-existing bundle rows. Recommend seeding a bundle row "
            "with status='active' and one with 'completed' before running this test for real, to "
            "confirm the enum cast maps both values correctly."
        )
        return True
    except Exception as exc:
        record(test, "FAIL", f"{type(exc).__name__}: {exc}\n{traceback.format_exc()[-1500:]}")
        return False


# ==================== TEST 3: Downgrade ====================


def test3_downgrade():
    test = "TEST 3: Downgrade (alembic downgrade base)"
    try:
        start = time.time()
        proc = run_alembic("downgrade", "base")
        duration = time.time() - start
        if proc.returncode != 0:
            record(test, "FAIL", f"downgrade base failed: {proc.stderr[-2000:]}", duration)
            return False

        from sqlalchemy import create_engine, text
        engine = create_engine(DB_URL)
        with engine.connect() as conn:
            tables = conn.execute(text(
                "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
            )).scalar()
            enums = conn.execute(text(
                "SELECT count(*) FROM pg_type WHERE typtype='e'"
            )).scalar()
        engine.dispose()

        issues = []
        if tables != 0:
            issues.append(f"{tables} tables still present after downgrade base (orphans)")
        if enums != 0:
            issues.append(f"{enums} enum types still present after downgrade base (orphans)")

        if issues:
            record(test, "FAIL", "; ".join(issues), duration)
            return False

        record(test, "PASS", "schema fully empty, no orphaned tables or enum types", duration)
        return True
    except Exception as exc:
        record(test, "FAIL", f"{type(exc).__name__}: {exc}\n{traceback.format_exc()[-1500:]}")
        return False


# ==================== TEST 4: Upgrade Again ====================


def test4_upgrade_again():
    test = "TEST 4: Upgrade Again (alembic upgrade head, post-downgrade)"
    try:
        start = time.time()
        proc = run_alembic("upgrade", "head")
        duration = time.time() - start
        if proc.returncode != 0:
            record(test, "FAIL", f"second upgrade head failed: {proc.stderr[-2000:]}", duration)
            return False

        from sqlalchemy import create_engine, inspect
        engine = create_engine(DB_URL)
        insp = inspect(engine)
        tables = insp.get_table_names()
        engine.dispose()

        if len(tables) != EXPECTED_TABLE_COUNT:
            record(test, "FAIL", f"expected {EXPECTED_TABLE_COUNT} tables after re-upgrade, found {len(tables)}", duration)
            return False

        record(test, "PASS", f"re-upgrade successful, {len(tables)} tables, matches TEST 1", duration)
        return True
    except Exception as exc:
        record(test, "FAIL", f"{type(exc).__name__}: {exc}\n{traceback.format_exc()[-1500:]}")
        return False


# ==================== TEST 5: Performance ====================


def test5_performance():
    test = "TEST 5: Performance (backfill with a larger dataset)"
    try:
        reset_database()
        proc = run_alembic("upgrade", "0001_baseline")
        if proc.returncode != 0:
            record(test, "FAIL", f"could not reach baseline: {proc.stderr[-1000:]}")
            return False

        from sqlalchemy import create_engine, text
        engine = create_engine(DB_URL)
        N = 20000
        log(f"Seeding {N} synthetic customer rows before running the multi-tenancy backfill...")
        with engine.connect() as conn:
            conn.execute(text(
                "INSERT INTO customers (code, name) "
                "SELECT 'CUST' || gs::text, 'Synthetic Customer ' || gs::text "
                "FROM generate_series(1, :n) gs"
            ), {"n": N})
            conn.commit()
        engine.dispose()

        start = time.time()
        proc = run_alembic("upgrade", "0002_multi_tenancy")
        duration = time.time() - start

        if proc.returncode != 0:
            record(test, "FAIL", f"0002_multi_tenancy failed against {N} rows: {proc.stderr[-2000:]}", duration)
            return False

        # finish the rest for subsequent tests to have a clean head state if run standalone
        run_alembic("upgrade", "head")

        threshold_s = 30.0
        status = "PASS" if duration < threshold_s else "FAIL"
        record(
            test, status,
            f"0002_multi_tenancy (backfilling company_id/factory_id across {N} customer rows "
            f"+ 38 other tables) took {duration:.2f}s (threshold: {threshold_s}s)",
            duration,
        )
        risks.append(
            f"Performance was measured with {N} synthetic rows in ONE table (customers); your "
            "real dataset size and distribution across all 39 tenant-scoped tables may differ. "
            "If any single table has >100k rows, re-run this test seeding that specific table "
            "before trusting the migration won't lock production for too long."
        )
        return status == "PASS"
    except Exception as exc:
        record(test, "FAIL", f"{type(exc).__name__}: {exc}\n{traceback.format_exc()[-1500:]}")
        return False


# ==================== TEST 6: Integrity ====================


def test6_integrity():
    test = "TEST 6: Integrity (FKs, uniques, indexes, enums, isolation)"
    try:
        from sqlalchemy import create_engine, text
        engine = create_engine(DB_URL)
        issues = []

        with engine.connect() as conn:
            fk_count = conn.execute(text(
                "SELECT count(*) FROM information_schema.table_constraints WHERE constraint_type='FOREIGN KEY'"
            )).scalar()
            unique_count = conn.execute(text(
                "SELECT count(*) FROM information_schema.table_constraints WHERE constraint_type='UNIQUE'"
            )).scalar()
            index_count = conn.execute(text(
                "SELECT count(*) FROM pg_indexes WHERE schemaname='public'"
            )).scalar()

            # enum value spot-checks
            enum_val_rows = conn.execute(text(
                """
                SELECT t.typname, e.enumlabel FROM pg_type t
                JOIN pg_enum e ON t.oid = e.enumtypid
                WHERE t.typname IN ('bundle_status', 'lot_status', 'fabric_roll_status')
                ORDER BY t.typname, e.enumsortorder
                """
            )).fetchall()
            found = {}
            for typname, label in enum_val_rows:
                found.setdefault(typname, []).append(label)

            expected = {
                "bundle_status": ["created", "issued", "in_production", "on_hold", "rejected", "rework", "completed", "packed", "closed"],
                "lot_status": ["created", "reserved", "fabric_allocated", "fabric_issued", "cutting", "cut", "bundles_generated", "in_production", "closed", "on_hold", "cancelled"],
                "fabric_roll_status": ["purchased", "inspected", "approved", "rejected", "stored", "allocated", "issued_to_cutting", "partially_used", "fully_consumed", "closed"],
            }
            for name, exp_vals in expected.items():
                if found.get(name) != exp_vals:
                    issues.append(f"enum {name}: expected {exp_vals}, found {found.get(name)}")

            # company/factory isolation: verify multi-tenant columns are NOT NULL where required
            not_null_check = conn.execute(text(
                """
                SELECT table_name FROM information_schema.columns
                WHERE column_name = 'factory_id' AND is_nullable = 'YES'
                AND table_name IN ('employees','machines','bundles','lots','fabric_rolls')
                """
            )).fetchall()
            if not_null_check:
                issues.append(f"factory_id should be NOT NULL but is nullable on: {[r[0] for r in not_null_check]}")

        engine.dispose()

        if issues:
            record(test, "FAIL", "; ".join(issues))
            return False

        record(
            test, "PASS",
            f"{fk_count} FKs, {unique_count} unique constraints, {index_count} indexes; "
            f"enum values match exactly for bundle_status/lot_status/fabric_roll_status; "
            f"factory_id correctly NOT NULL on floor-level tables",
        )
        risks.append(
            "Company/Factory isolation was checked at the SCHEMA level (NOT NULL columns exist) "
            "but not at the APPLICATION level (i.e. actually inserting two companies' data and "
            "confirming TenantContext.apply() filters correctly). That requires running the FastAPI "
            "app itself against this DB with real HTTP requests, which is outside this script's scope."
        )
        return True
    except Exception as exc:
        record(test, "FAIL", f"{type(exc).__name__}: {exc}\n{traceback.format_exc()[-1500:]}")
        return False


# ==================== TEST 7: Application Startup ====================


def test7_startup_validation():
    test = "TEST 7: Application Startup (refuses when pending, succeeds at head)"
    try:
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        sys.path.insert(0, backend_dir)
        os.environ["DATABASE_URL"] = DB_URL

        # Case A: DB behind head -> must refuse
        reset_database()
        proc = run_alembic("upgrade", "0003_masters_rate")  # deliberately not head
        if proc.returncode != 0:
            record(test, "FAIL", f"could not set up behind-head state: {proc.stderr[-1000:]}")
            return False

        from app.main import _verify_alembic_version, MigrationStateError
        refused = False
        try:
            _verify_alembic_version()
        except MigrationStateError:
            refused = True
        except Exception as exc:
            record(test, "FAIL", f"unexpected exception type on behind-head check: {type(exc).__name__}: {exc}")
            return False

        if not refused:
            record(test, "FAIL", "startup did NOT refuse when DB was behind head (should have raised MigrationStateError)")
            return False

        # Case B: DB at head -> must succeed
        proc = run_alembic("upgrade", "head")
        if proc.returncode != 0:
            record(test, "FAIL", f"could not reach head: {proc.stderr[-1000:]}")
            return False

        try:
            _verify_alembic_version()
        except Exception as exc:
            record(test, "FAIL", f"startup check raised at head (should have passed): {type(exc).__name__}: {exc}")
            return False

        record(test, "PASS", "refuses when behind head (MigrationStateError raised), succeeds at head")
        return True
    except Exception as exc:
        record(test, "FAIL", f"{type(exc).__name__}: {exc}\n{traceback.format_exc()[-1500:]}")
        return False


# ==================== REPORT ====================


def generate_report():
    lines = []
    lines.append("# Migration Validation Report")
    lines.append(f"\nGenerated: {datetime.now().isoformat()}")
    lines.append(f"Database: `{DB_URL.rsplit('@', 1)[-1]}` (disposable)\n")

    order = [
        "TEST 1: Empty Database (alembic upgrade head)",
        "TEST 2: Existing Database (upgrade from baseline, data preserved)",
        "TEST 3: Downgrade (alembic downgrade base)",
        "TEST 4: Upgrade Again (alembic upgrade head, post-downgrade)",
        "TEST 5: Performance (backfill with a larger dataset)",
        "TEST 6: Integrity (FKs, uniques, indexes, enums, isolation)",
        "TEST 7: Application Startup (refuses when pending, succeeds at head)",
    ]

    all_pass = True
    for t in order:
        r = results.get(t, {"status": "SKIP", "detail": "not run", "duration_s": None})
        marker = {"PASS": "✓", "FAIL": "✗", "SKIP": "○"}[r["status"]]
        dur = f" ({r['duration_s']:.2f}s)" if r["duration_s"] is not None else ""
        lines.append(f"## {marker} {t}{dur}")
        lines.append(r["detail"])
        lines.append("")
        if r["status"] != "PASS":
            all_pass = False

    lines.append("## Summary")
    lines.append(f"- ✓ Upgrade Passed: {'YES' if results.get(order[0], {}).get('status') == 'PASS' and results.get(order[3], {}).get('status') == 'PASS' else 'NO'}")
    lines.append(f"- ✓ Downgrade Passed: {'YES' if results.get(order[2], {}).get('status') == 'PASS' else 'NO'}")
    lines.append(f"- ✓ Existing Data Preserved: {'YES' if results.get(order[1], {}).get('status') == 'PASS' else 'NO'}")
    lines.append(f"- ✓ No Data Loss: {'YES' if results.get(order[1], {}).get('status') == 'PASS' else 'NO'}")
    lines.append(f"- ✓ Startup Validation Passed: {'YES' if results.get(order[6], {}).get('status') == 'PASS' else 'NO'}")
    perf = results.get(order[4], {})
    lines.append(f"- ✓ Performance Metrics: {perf.get('detail', 'not run')}")
    lines.append("")
    lines.append("## Remaining Risks")
    if risks:
        for r in risks:
            lines.append(f"- {r}")
    else:
        lines.append("- None identified beyond what's noted per-test above.")
    lines.append("")
    lines.append(f"## Overall: {'ALL TESTS PASSED' if all_pass else 'ONE OR MORE TESTS FAILED — do not treat this as the official baseline until fixed'}")

    report = "\n".join(lines)
    out_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "MIGRATION_VALIDATION_REPORT.md")
    with open(out_path, "w") as f:
        f.write(report)

    print("\n" + "=" * 70)
    print(report)
    print("=" * 70)
    print(f"\nReport written to: {out_path}")
    return all_pass


def main():
    log(f"Connecting to validation database: {DB_URL}")
    test1_empty_database()
    test2_existing_database()
    test3_downgrade()
    test4_upgrade_again()
    test5_performance()
    test6_integrity()
    test7_startup_validation()

    all_pass = generate_report()
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()
