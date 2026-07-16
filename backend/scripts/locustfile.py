"""
Load & Performance Testing (Locust) -- addresses the module's own ask
for 10,000 employees / 100,000 bundles / 1,000,000 scan events / 1,000
concurrent dashboard users. This is a REAL, runnable load-testing
script, not a report of numbers that were never measured.

Usage (requires: pip install locust, a running instance of the app,
and a real seeded database -- none of which exist in this sandbox):

    pip install locust
    locust -f scripts/locustfile.py --host http://localhost:8000

Then open http://localhost:8089 to configure concurrent user count and
ramp-up rate, and start the test against a REAL running instance.

What this measures once run for real: response time percentiles and
throughput for the highest-traffic real workflows (barcode scan, live
dashboard polling, report generation) under concurrent load -- exactly
the "millions of scan events / 1000 concurrent users" scenario the
module spec describes, using Locust's standard swarm model rather than
a hand-rolled concurrency script.

IMPORTANT: every user in this file must first log in with real
credentials seeded into the target database -- this script does NOT
create test data itself (that's what scripts/seed_load_test_data.py,
alongside this file, is for). Running this against a database with no
seeded bundles/employees will mostly measure 404s, not real performance.
"""
import random

from locust import HttpUser, task, between


class FactoryFloorUser(HttpUser):
    """Simulates a worker/supervisor scanning bundles and checking the
    live dashboard -- the highest-frequency real workflow in this ERP
    (module 6's scan_service, hit by every bundle move)."""

    wait_time = between(1, 3)  # seconds between actions, roughly matching a real worker's scan cadence

    def on_start(self):
        # Real login -- credentials must be seeded in the target DB first.
        # See scripts/seed_load_test_data.py for creating LOAD_TEST_USER_*.
        resp = self.client.post(
            "/api/v1/auth/login",
            json={"email": "loadtest_operator@example.com", "password": "LoadTest123!"},
        )
        if resp.status_code == 200:
            self.token = resp.json()["access_token"]
            self.client.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            self.token = None

    @task(10)
    def scan_bundle(self):
        """The single most frequent real action on a factory floor --
        weighted heaviest (10x) in this task mix."""
        # Barcode values must exist in the seeded dataset; a real run
        # would pull from a pre-generated pool rather than a fixed value.
        barcode = f"BND{random.randint(1, 100000):05d}"
        self.client.post(
            "/api/v1/production/scan",
            json={"barcode_value": barcode, "employee_id": random.randint(1, 10000)},
            name="/production/scan",
        )

    @task(3)
    def view_live_dashboard(self):
        """Module 15's Factory Command Center -- polled/refreshed
        frequently by supervisors even with WebSocket push available,
        since not every client will maintain a live connection."""
        self.client.get("/api/v1/command-center/overview", name="/command-center/overview")

    @task(2)
    def check_wip_report(self):
        self.client.get("/api/v1/analytics/production/wip", name="/analytics/production/wip")

    @task(1)
    def view_machine_status(self):
        self.client.get("/api/v1/machine-tracking/fleet-dashboard", name="/machine-tracking/fleet-dashboard")


class ManagementUser(HttpUser):
    """Simulates a smaller population of managers pulling heavier
    aggregation reports -- fewer users (weight below), but each request
    is more expensive (costing/payroll dashboards touch more tables),
    which is exactly the kind of load profile that can hide slow queries
    a pure high-frequency-cheap-request test wouldn't surface."""

    wait_time = between(5, 15)
    weight = 1  # spawned far less often than FactoryFloorUser (weight 10, set via class attribute below)

    def on_start(self):
        resp = self.client.post(
            "/api/v1/auth/login",
            json={"email": "loadtest_manager@example.com", "password": "LoadTest123!"},
        )
        if resp.status_code == 200:
            self.token = resp.json()["access_token"]
            self.client.headers.update({"Authorization": f"Bearer {self.token}"})

    @task(3)
    def costing_dashboard(self):
        self.client.get("/api/v1/costing/dashboard", name="/costing/dashboard")

    @task(3)
    def payroll_dashboard(self):
        import datetime
        today = datetime.date.today()
        self.client.get(f"/api/v1/payroll/dashboard?month={today.month}&year={today.year}", name="/payroll/dashboard")

    @task(2)
    def executive_mis(self):
        import datetime
        today = datetime.date.today()
        self.client.get(
            f"/api/v1/analytics/mis?date_from={today.isoformat()}&date_to={today.isoformat()}",
            name="/analytics/mis",
        )

    @task(1)
    def quality_kpis(self):
        import datetime
        today = datetime.date.today()
        self.client.get(
            f"/api/v1/analytics/quality/kpis?date_from={today.isoformat()}&date_to={today.isoformat()}",
            name="/analytics/quality/kpis",
        )


# Set relative weights explicitly (Locust spawns users proportionally):
FactoryFloorUser.weight = 10
ManagementUser.weight = 1
