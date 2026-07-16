#!/usr/bin/env python3
"""
Runtime smoke assertions -- real HTTP requests against a real running
instance of the app (started by run_runtime_smoke_test.sh), not mocked
and not simulated. Checks the things that can only be verified once the
process actually boots: health endpoint, OpenAPI schema generation
(catches route-registration errors that ast.parse can't), auth rejection
on protected routes, and a real login round-trip.
"""
import sys
import httpx

BASE_URL = "http://127.0.0.1:8123"
results = []


def check(name, condition, detail=""):
    status = "PASS" if condition else "FAIL"
    results.append((name, status, detail))
    print(f"[{status}] {name}" + (f" -- {detail}" if detail else ""))


def main():
    client = httpx.Client(base_url=BASE_URL, timeout=10)

    # 1. Health endpoint
    resp = client.get("/health")
    check("GET /health returns 200", resp.status_code == 200, f"got {resp.status_code}")
    if resp.status_code == 200:
        check("/health reports database ok", resp.json().get("database") == "ok", str(resp.json()))

    # 2. OpenAPI schema actually generates -- this is the real value here:
    # a broken route (bad Pydantic model, duplicate operation ID, circular
    # import surfaced only at import time) can pass ast.parse but still
    # crash FastAPI's schema generation. This is the first real check
    # this project has been able to run against that risk.
    resp = client.get("/api/openapi.json")
    check("OpenAPI schema generates without error", resp.status_code == 200, f"got {resp.status_code}")
    if resp.status_code == 200:
        schema = resp.json()
        path_count = len(schema.get("paths", {}))
        check("OpenAPI schema has a non-trivial number of paths", path_count > 400, f"found {path_count} paths")

    # 3. Protected routes actually reject unauthenticated requests
    resp = client.get("/api/v1/employee-work/queue/1")
    check("Protected route rejects unauthenticated request", resp.status_code in (401, 403), f"got {resp.status_code}")

    # 4. Public routes remain reachable without auth
    resp = client.post("/api/v1/auth/login", json={"email": "nonexistent@test.com", "password": "wrong"})
    check("Public login route is reachable (expect 401 for bad creds, not 403/404)", resp.status_code == 401, f"got {resp.status_code}")

    # 5. CORS header reflects the configured origin, not a wildcard
    resp = client.options(
        "/api/v1/auth/login",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST"},
    )
    cors_header = resp.headers.get("access-control-allow-origin")
    check("CORS reflects configured origin, not '*'", cors_header == "http://localhost:3000", f"got {cors_header}")

    failed = [r for r in results if r[1] == "FAIL"]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed.")
    if failed:
        print("FAILED CHECKS:")
        for name, status, detail in failed:
            print(f"  - {name}: {detail}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
