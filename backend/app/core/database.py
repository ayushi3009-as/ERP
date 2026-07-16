from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

_engine_kwargs = {}

if settings.DATABASE_URL.startswith("sqlite"):
    _engine_kwargs["connect_args"] = {"check_same_thread": False}

    # Enable WAL mode for SQLite for better concurrency
    def _set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
else:
    _engine_kwargs["pool_size"] = 20
    _engine_kwargs["max_overflow"] = 40
    _engine_kwargs["pool_pre_ping"] = True
    _engine_kwargs["pool_recycle"] = 3600

engine = create_engine(settings.DATABASE_URL, **_engine_kwargs)

if settings.DATABASE_URL.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _on_sqlite_connect(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

try:
    from sqlalchemy.orm import declarative_base

    Base = declarative_base()
except ImportError:
    from sqlalchemy.ext.declarative import declarative_base

    Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
