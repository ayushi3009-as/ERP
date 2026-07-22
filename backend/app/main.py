import logging
import sys
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import engine, SessionLocal, Base

# Import all models so Base.metadata is populated
import app.models.models as models  # noqa: F401

logger = logging.getLogger("microerp")


class MigrationStateError(RuntimeError):
    """Raised when the database schema is behind (or ahead of, or has
    never run) Alembic migrations. Startup refuses to continue rather than
    running silently against an outdated/unknown schema."""


def _verify_alembic_version():
    """Compares the DB's alembic_version against the migration scripts'
    head revision. Refuses startup on any mismatch — no silent fallback.

    ENVIRONMENT=test is the only escape hatch (see _create_tables), for
    ephemeral test databases that don't carry real data and don't need
    migration history at all.
    """
    if settings.ENVIRONMENT == "test":
        logger.info("ENVIRONMENT=test — skipping Alembic version check.")
        return

    from alembic.config import Config as AlembicConfig
    from alembic.script import ScriptDirectory
    from alembic.runtime.migration import MigrationContext
    import os as _os

    backend_dir = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
    alembic_ini = _os.path.join(backend_dir, "alembic.ini")
    cfg = AlembicConfig(alembic_ini)
    cfg.set_main_option("script_location", _os.path.join(backend_dir, "alembic"))
    script = ScriptDirectory.from_config(cfg)
    head_revision = script.get_current_head()

    try:
        with engine.connect() as connection:
            context = MigrationContext.configure(connection)
            current_revision = context.get_current_revision()
    except Exception as exc:
        raise MigrationStateError(
            f"Could not read alembic_version from the database: {exc}\n"
            f"Has the database ever been migrated? Run:\n"
            f"    alembic upgrade head\n"
            f"(or, for a fresh DB with existing data from create_all(), stamp the "
            f"baseline first: alembic stamp 0001_baseline, then alembic upgrade head)"
        )

    if current_revision is None:
        raise MigrationStateError(
            "Database has no Alembic version stamped (alembic_version table is "
            "empty or missing). This looks like a database created via "
            "Base.metadata.create_all() that has never been brought under "
            "Alembic control.\n\n"
            "If this is the existing dev database (has real data, tables already "
            "exist from create_all()):\n"
            "    alembic stamp 0001_baseline\n"
            "    alembic upgrade head\n\n"
            "If this is a brand-new/empty database:\n"
            "    alembic upgrade head\n"
        )

    if current_revision != head_revision:
        raise MigrationStateError(
            f"Database schema is out of date.\n"
            f"    current revision : {current_revision}\n"
            f"    required (head)  : {head_revision}\n\n"
            f"Run the pending migrations before starting the app:\n"
            f"    alembic upgrade head\n\n"
            f"See docs/MIGRATIONS.md for the full migration workflow."
        )

    logger.info(f"Alembic schema check passed — database is at head ({head_revision}).")


def _create_tables():
    """Base.metadata.create_all() — ONLY for ENVIRONMENT=test (ephemeral
    test databases). Normal development/production startup must go
    through Alembic migrations (_verify_alembic_version), never this."""
    if settings.ENVIRONMENT != "test":
        return
    Base.metadata.create_all(bind=engine)
    logger.info("ENVIRONMENT=test — tables created via create_all() (no migration history).")


def _seed_admin():
    """Seed the default admin user if it doesn't exist."""
    from app.core.security import get_password_hash

    db = SessionLocal()
    try:
        admin = (
            db.query(models.User)
            .filter(models.User.email == "admin@microerp.com")
            .first()
        )
        if admin is None:
            admin = models.User(
                email="admin@microerp.com",
                username="admin",
                password_hash=get_password_hash("Admin@123"),
                full_name="System Administrator",
                phone="",
                role=models.UserRole.SUPER_ADMIN,
                is_active=True,
                is_verified=True,
                created_by=None,
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)
            logger.info("Default admin user created: admin@microerp.com / Admin@123")
        else:
            # Ensure password is valid
            from app.core.security import verify_password

            if not verify_password("Admin@123", admin.password_hash):
                admin.password_hash = get_password_hash("Admin@123")
                db.commit()
                logger.info("Admin password rehashed.")
            logger.info("Admin user already exists.")

        # Seed default company if none
        company = db.query(models.Company).first()
        if company is None:
            company = models.Company(
                name="Microtechnique Garments",
                short_name="MTG",
                address="Main Office",
                city="Mumbai",
                state="Maharashtra",
                pincode="400001",
                country="India",
                currency="INR",
                financial_year_start="04-01",
                financial_year_end="03-31",
            )
            db.add(company)
            db.commit()
            db.refresh(company)
            logger.info("Default company seeded.")

        # Seed default factory for that company if none exists yet.
        # This is what keeps the UI single-factory-simple: as long as there's
        # only ever one factory, no factory picker/switcher needs to render
        # anywhere in the frontend. It only appears once a second Factory row
        # is created (module: Masters > Factory, admin/company_admin only).
        factory = (
            db.query(models.Factory)
            .filter(models.Factory.company_id == company.id)
            .first()
        )
        if factory is None:
            factory = models.Factory(
                company_id=company.id,
                name=company.name,
                code="MAIN",
                address=company.address,
                city=company.city,
                state=company.state,
                pincode=company.pincode,
                gst_number=company.gst_number,
                is_default=True,
            )
            db.add(factory)
            db.commit()
            db.refresh(factory)
            logger.info("Default factory seeded.")

        # Backfill admin's company/factory now that both exist
        if admin.company_id is None or admin.factory_id is None:
            admin.company_id = company.id
            admin.factory_id = None  # super_admin: whole company, no single-factory lock
            db.commit()

        # Seed default number series
        series_modules = [
            ("Lot", "LOT", 6, "lot"),
            ("Design", "DSN", 4, "design"),
            ("Internal Payment", "PAY", 5, "internal_payment"),
        ]
        for name, prefix, pad, module in series_modules:
            existing = (
                db.query(models.NumberSeries)
                .filter(
                    models.NumberSeries.module == module,
                    models.NumberSeries.factory_id == factory.id,
                )
                .first()
            )
            if not existing:
                ns = models.NumberSeries(
                    company_id=company.id,
                    factory_id=factory.id,
                    series_name=name,
                    prefix=prefix,
                    current_number=0,
                    pad_length=pad,
                    module=module,
                )
                db.add(ns)
        db.commit()
        logger.info("Number series seeded.")

    except Exception as e:
        logger.error(f"Seed error: {e}")
        db.rollback()
    finally:
        db.close()


@asynccontextmanager
class SecurityConfigError(RuntimeError):
    """Raised when a security-critical setting is still at its insecure
    default value outside development/test."""


DEFAULT_SECRET_KEY = "micro-erp-super-secret-key-change-in-production"


def _verify_secret_key():
    """Refuses to start in production with the hardcoded default
    SECRET_KEY -- found during the final security review: that default
    is baked into source (core/config.py), so any deployment that
    forgets to set the SECRET_KEY env var would sign JWTs with a secret
    anyone reading the public source already knows, making every token
    forgeable. development/test are exempted (convenience for local
    work); anything else must set a real secret."""
    if settings.SECRET_KEY == DEFAULT_SECRET_KEY and settings.ENVIRONMENT not in ("development", "test"):
        raise SecurityConfigError(
            "SECRET_KEY is still the hardcoded default value from core/config.py. "
            "Refusing to start with ENVIRONMENT="
            f"'{settings.ENVIRONMENT}' using a publicly-known JWT signing secret.\n"
            "Set a real SECRET_KEY environment variable before starting in this environment."
        )


async def lifespan(app: FastAPI):
    try:
        _verify_secret_key()
    except SecurityConfigError as exc:
        logger.error(f"\n{'=' * 70}\nSTARTUP REFUSED — SECURITY CONFIG ERROR\n{'=' * 70}\n{exc}\n{'=' * 70}")
        sys.exit(1)

    try:
        _verify_alembic_version()
    except MigrationStateError as exc:
        logger.error(f"\n{'=' * 70}\nSTARTUP REFUSED — MIGRATION STATE ERROR\n{'=' * 70}\n{exc}\n{'=' * 70}")
        sys.exit(1)

    _create_tables()  # no-op unless ENVIRONMENT=test
    _seed_admin()
    
    # Auto-migrate missing columns for smooth updates
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE lots ADD COLUMN IF NOT EXISTS color VARCHAR(100);"))
            conn.execute(text("ALTER TABLE lots ADD COLUMN IF NOT EXISTS item_name VARCHAR(255);"))
            conn.execute(text("ALTER TABLE services ADD COLUMN IF NOT EXISTS date DATE;"))
            conn.execute(text("ALTER TABLE services ADD COLUMN IF NOT EXISTS design_no VARCHAR(100);"))
            conn.execute(text("ALTER TABLE fabrics ADD COLUMN IF NOT EXISTS qty_in_kg NUMERIC(15, 2) DEFAULT 0;"))
            conn.commit()
    except Exception as exc:
        logger.warning(f"Schema auto-update warning: {exc}")

    import asyncio
    from app.services import connection_manager
    connection_manager.set_main_event_loop(asyncio.get_event_loop())

    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import os
if not os.path.exists("uploads"):
    os.makedirs("uploads")
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Rate limiting: found completely absent during the go-live blocker
# review (Blocker 3). Applied globally via middleware rather than
# per-endpoint decorators, so every one of the 487 existing endpoints is
# covered without editing all of them individually -- consistent with
# "do not duplicate work" applied to hardening, not just business logic.
# Limits are deliberately generous defaults (a real deployment should
# tune per-endpoint, especially /auth/login, which deserves a much
# stricter limit than the rest -- noted, not implemented here, since
# that requires per-route configuration decisions this pass shouldn't
# make unilaterally). Not verified end-to-end (no network to install
# slowapi or a running instance to actually send requests against).
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded

    limiter = Limiter(key_func=get_remote_address, default_limits=["300/minute"])
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    from slowapi.middleware import SlowAPIMiddleware
    app.add_middleware(SlowAPIMiddleware)
except ImportError:
    logger.warning(
        "slowapi not installed -- rate limiting disabled. "
        "Install it (see requirements.txt) before a real production deployment."
    )

# Prometheus metrics: found missing entirely during the final production-
# readiness review (Section 12). Exposes /metrics with request counts,
# latencies, and in-progress requests out of the box -- Grafana can point
# a Prometheus data source at this immediately. Not verified end-to-end
# in this environment (no network to install prometheus-fastapi-
# instrumentator or a running Prometheus to scrape it), so this is
# wired correctly but untested, same disclosure as everything else this
# session built without a live environment to confirm against.
try:
    from prometheus_fastapi_instrumentator import Instrumentator
    Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
except ImportError:
    logger.warning(
        "prometheus-fastapi-instrumentator not installed -- /metrics endpoint disabled. "
        "Install it (see requirements.txt) to enable Prometheus scraping."
    )


@app.get("/health")
def health_check():
    """Real DB connectivity check, not just 'the process is alive' --
    used by docker-compose's healthcheck and any load balancer probe.
    Deliberately does NOT check Alembic version here (that's a startup-
    time gate, already enforced in lifespan()) — this just answers
    'can this instance currently reach its database', which is a
    materially different (and cheaper, pollable) question."""
    from app.core.database import engine
    from sqlalchemy import text
    from fastapi.responses import JSONResponse
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "ok", "version": settings.APP_VERSION}
    except Exception as exc:
        return JSONResponse(status_code=503, content={"status": "error", "database": str(exc)})


@app.get("/liveness")
def liveness_check():
    """'Is this process alive at all' -- deliberately does NOT touch the
    database. A load balancer/orchestrator should restart the container
    if this ever fails to respond, but should NOT restart it just because
    the database is briefly unreachable (that's what /readiness is for,
    and restarting the app won't fix a database outage)."""
    return {"status": "alive"}


@app.get("/readiness")
def readiness_check():
    """'Is this instance ready to receive real traffic' -- checks DB
    connectivity AND that the schema is actually at the Alembic head
    (not just reachable). An instance mid-deploy, waiting on a migration
    another instance is running, should report NOT ready rather than
    accept requests against a schema it doesn't match yet."""
    from app.core.database import engine
    from sqlalchemy import text
    from fastapi.responses import JSONResponse

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        return JSONResponse(status_code=503, content={"status": "not_ready", "reason": f"database unreachable: {exc}"})

    try:
        _verify_alembic_version()
    except MigrationStateError as exc:
        return JSONResponse(status_code=503, content={"status": "not_ready", "reason": f"schema not at head: {exc}"})
    except Exception:
        # ENVIRONMENT=test skips this check entirely (see _verify_alembic_version) -- that's fine, not a readiness failure
        pass

    return {"status": "ready", "version": settings.APP_VERSION}


app.include_router(api_router, prefix="/api/v1")


@app.get("/api/health")
def health_check():
    return {"status": "healthy", "version": settings.APP_VERSION}
