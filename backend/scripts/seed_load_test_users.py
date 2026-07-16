#!/usr/bin/env python3
"""
Seeds the two load-test users scripts/locustfile.py logs in as. Run this
against your target load-test database BEFORE running Locust -- it does
NOT seed bundles/employees/machines at scale (that's a separate,
larger data-generation concern depending on which scale you're testing
at: 10,000 employees and 100,000 bundles need a bulk generator, not this
script, which only creates the two auth accounts).

Usage:
    cd backend
    DATABASE_URL=<your load-test db> python3 scripts/seed_load_test_users.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal
from app.core.security import get_password_hash
from app.models.models import User, UserRole


def main():
    db = SessionLocal()
    try:
        for email, role in [
            ("loadtest_operator@example.com", UserRole.OPERATOR),
            ("loadtest_manager@example.com", UserRole.PRODUCTION_MANAGER),
        ]:
            existing = db.query(User).filter(User.email == email).first()
            if existing:
                print(f"{email} already exists, skipping")
                continue
            user = User(
                email=email, username=email.split("@")[0],
                password_hash=get_password_hash("LoadTest123!"),
                full_name=f"Load Test {role.value}", role=role, is_verified=True,
            )
            db.add(user)
            print(f"Created {email} ({role.value})")
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
