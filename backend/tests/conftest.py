"""
Shared pytest fixtures for the test suite.

IMPORTANT — READ BEFORE TRUSTING ANY TEST RESULT IN THIS DIRECTORY:
These fixtures require pytest, sqlalchemy, and a real PostgreSQL instance
to be installed/reachable. None of that was available in the environment
that wrote this file (no network, no DB, pytest itself not installed) —
these tests have been verified with `ast.parse` (they are syntactically
valid Python) but have NEVER BEEN EXECUTED. Run them yourself with:

    cd backend
    pip install -r requirements.txt -r requirements-dev.txt
    export DATABASE_URL=postgresql://microerp:microerp@localhost:55432/microerp_validation
    pytest tests/ -v

before treating any "test" in this directory as a verified fact about the
codebase's behavior.
"""
import os
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
import app.models.models as models

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql://microerp:microerp@localhost:55432/microerp_validation",
)


@pytest.fixture(scope="session")
def engine():
    eng = create_engine(TEST_DATABASE_URL)
    Base.metadata.create_all(bind=eng)  # tests use create_all, not Alembic —
    # deliberately: these are unit/service tests, not migration tests
    # (migration correctness is scripts/validate_migrations.py's job).
    yield eng
    Base.metadata.drop_all(bind=eng)


@pytest.fixture()
def db(engine):
    """One transaction per test, rolled back after — tests never see each
    other's data and never persist anything real."""
    connection = engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection)
    session = Session()
    yield session
    session.close()
    transaction.rollback()
    connection.close()


class FakeTenantContext:
    """Minimal stand-in for app.api.v1.dependencies.TenantContext, avoiding
    a FastAPI Depends()-based import chain in pure service-layer tests."""

    def __init__(self, company_id, factory_id):
        self.company_id = company_id
        self.factory_id = factory_id

    def apply(self, query, model):
        if hasattr(model, "factory_id") and self.factory_id is not None:
            return query.filter(model.factory_id == self.factory_id)
        if hasattr(model, "company_id") and self.company_id is not None:
            return query.filter(model.company_id == self.company_id)
        return query


@pytest.fixture()
def tenant(db):
    company = models.Company(name="Test Co", short_name="TCO", country="India", currency="INR",
                              financial_year_start="04-01", financial_year_end="03-31")
    db.add(company)
    db.flush()
    factory = models.Factory(company_id=company.id, name="Test Factory", code="MAIN", is_default=True)
    db.add(factory)
    db.flush()
    return FakeTenantContext(company_id=company.id, factory_id=factory.id)


@pytest.fixture()
def sample_employee(db, tenant):
    from datetime import date
    emp = models.Employee(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        code="EMP001", full_name="Test Employee", date_of_joining=date.today(),
    )
    db.add(emp)
    db.flush()
    return emp


@pytest.fixture()
def sample_bundle(db, tenant):
    product = models.Product(company_id=tenant.company_id, sku="SKU001", name="Test Shirt")
    db.add(product)
    db.flush()
    po = models.ProductionOrder(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        production_number="PROD00001", production_date=__import__("datetime").date.today(),
        product_id=product.id, planned_quantity=100,
    )
    db.add(po)
    db.flush()
    bundle = models.Bundle(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        bundle_number="BNDL00001", production_order_id=po.id, quantity=50,
    )
    db.add(bundle)
    db.flush()
    return bundle
