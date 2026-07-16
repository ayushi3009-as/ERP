"""
HTTP integration tests -- the gap explicitly flagged in
PRODUCTION_READINESS_REPORT.md Section 3: "there is no integration test
suite that starts the FastAPI app and issues real HTTP requests."

Unlike tests/test_*_service.py (which call service functions directly),
these go through the real ASGI app via FastAPI's TestClient -- real
routing, real Pydantic request/response validation, real dependency
injection -- with `get_db` overridden to the test database session and
`get_current_user` overridden to a fixed test user, so these test the
HTTP layer itself without needing a real login/JWT round trip for every
test. A SEPARATE small suite (test_auth_flow.py-style, see
test_real_login_flow below) exercises the actual login endpoint with a
real JWT, to confirm the auth override isn't hiding a real bug in
token issuance/validation.

STATUS: syntax-verified (`ast.parse`) only. NOT EXECUTED -- see
tests/conftest.py docstring for why and how to run these for real.
"""
import pytest
from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient

from app.main import app
from app.core.database import get_db
from app.api.v1.dependencies import get_current_user, get_tenant_context, TenantContext


@pytest.fixture()
def test_user(db, tenant):
    from app.models.models import User, UserRole
    user = User(
        email="integration-test@example.com", username="integration_test",
        password_hash="not-a-real-hash-bypassed-by-override",
        full_name="Integration Test User", role=UserRole.SUPER_ADMIN,
        company_id=tenant.company_id, factory_id=tenant.factory_id,
    )
    db.add(user)
    db.flush()
    return user


@pytest.fixture()
def client(db, tenant, test_user):
    """The core HTTP test fixture: overrides get_db to the test
    transaction, get_current_user to a fixed user, and get_tenant_context
    to the test tenant -- so a full HTTP round trip runs against the same
    isolated per-test transaction every other test in this project uses."""
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: test_user
    app.dependency_overrides[get_tenant_context] = lambda: tenant
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ==================== Cross-cutting HTTP-layer checks ====================


def test_openapi_schema_generates(client):
    """The single highest-value HTTP-layer check: FastAPI must be able to
    build its OpenAPI schema from every registered route without error.
    A bad Pydantic model, a duplicate operation ID, or a route with a
    non-serializable default can pass ast.parse but crash this."""
    resp = client.get("/api/openapi.json")
    assert resp.status_code == 200
    schema = resp.json()
    assert len(schema["paths"]) > 400


def test_unauthenticated_request_rejected_without_override(db, tenant):
    """With NO dependency override, a protected route must reject."""
    with TestClient(app) as c:
        resp = c.get("/api/v1/employee-work/queue/1")
    assert resp.status_code in (401, 403)


def test_health_endpoint_reachable(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


# ==================== Module-by-module HTTP smoke coverage ====================
# One representative request per module, through the real HTTP layer --
# not exhaustive (that's what the service-layer unit tests are for), but
# enough to catch routing/serialization bugs the unit tests can't see.


def test_lots_list_endpoint(client):
    resp = client.get("/api/v1/lots/")
    assert resp.status_code == 200
    assert "items" in resp.json()


def test_machine_tracking_dashboard_endpoint(client):
    resp = client.get("/api/v1/machine-tracking/fleet-dashboard")
    assert resp.status_code == 200
    assert "total_machines" in resp.json()


def test_quality_defect_categories_endpoint(client):
    resp = client.get("/api/v1/quality/defect-categories")
    assert resp.status_code == 200


def test_payroll_policy_endpoint(client):
    resp = client.get("/api/v1/payroll/policy")
    assert resp.status_code == 200
    assert "pf_rate_pct" in resp.json()


def test_costing_dashboard_endpoint(client):
    resp = client.get("/api/v1/costing/dashboard")
    assert resp.status_code == 200


def test_sales_dashboard_endpoint(client):
    resp = client.get("/api/v1/sales-dispatch/dashboard")
    assert resp.status_code == 200


def test_analytics_production_summary_endpoint(client):
    today = date.today().isoformat()
    resp = client.get(f"/api/v1/analytics/production/summary?date_from={today}&date_to={today}")
    assert resp.status_code == 200


def test_command_center_overview_endpoint(client):
    resp = client.get("/api/v1/command-center/overview")
    assert resp.status_code == 200


def test_printing_history_endpoint(client):
    resp = client.get("/api/v1/printing/history")
    assert resp.status_code == 200


def test_mobile_home_screens_endpoint(client):
    resp = client.get("/api/v1/mobile/home/screens")
    assert resp.status_code == 200
    assert "screens" in resp.json()


def test_ai_alerts_endpoint(client):
    resp = client.get("/api/v1/ai/alerts")
    assert resp.status_code == 200


# ==================== Real auth flow (no override) ====================


def test_real_login_flow_with_wrong_password_returns_401(db):
    """No dependency override here -- this exercises the REAL
    /auth/login endpoint, real password verification, real JWT issuance
    path (even though it fails before reaching it) end to end."""
    with TestClient(app) as c:
        resp = c.post("/api/v1/auth/login", json={"email": "nobody@example.com", "password": "wrong"})
    assert resp.status_code == 401


def test_real_login_flow_success_issues_real_jwt(db, tenant):
    """Creates a real user with a REAL bcrypt hash (not the override
    fixture's placeholder), logs in for real, and confirms a usable
    access_token comes back -- then uses that real token on a protected
    route with NO override, closing the loop the other tests in this
    file intentionally skip via dependency_overrides."""
    from app.models.models import User, UserRole
    from app.core.security import get_password_hash

    user = User(
        email="realauth@example.com", username="realauth",
        password_hash=get_password_hash("CorrectHorseBatteryStaple1!"),
        full_name="Real Auth Test", role=UserRole.SUPER_ADMIN,
    )
    db.add(user)
    db.flush()

    with TestClient(app) as c:
        login_resp = c.post("/api/v1/auth/login", json={"email": "realauth@example.com", "password": "CorrectHorseBatteryStaple1!"})
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]

        me_resp = c.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_resp.status_code == 200
        assert me_resp.json()["email"] == "realauth@example.com"
