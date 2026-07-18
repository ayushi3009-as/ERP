from sqlalchemy import create_engine
from sqlalchemy import text
from app.core.config import settings

def main():
    print("Connecting to database...")
    engine = create_engine(settings.DATABASE_URL)
    
    print("Adding columns to users...")
    try:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN employee_id VARCHAR(50);"))
            conn.execute(text("ALTER TABLE users ADD COLUMN barcode VARCHAR(255);"))
            conn.execute(text("ALTER TABLE users ADD COLUMN joined_date DATE;"))
    except Exception as e:
        print(f"Users columns might already exist: {e}")

    print("Adding columns to companies...")
    try:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE companies ADD COLUMN is_approved BOOLEAN DEFAULT FALSE;"))
            conn.execute(text("ALTER TABLE companies ADD COLUMN subscription_plan VARCHAR(50) DEFAULT 'trial';"))
            conn.execute(text("ALTER TABLE companies ADD COLUMN subscription_expiry TIMESTAMP WITH TIME ZONE;"))
            conn.execute(text("ALTER TABLE companies ADD COLUMN tenant_status VARCHAR(50) DEFAULT 'pending';"))
            conn.execute(text("ALTER TABLE companies ADD COLUMN payment_screenshot_url VARCHAR(500);"))
            conn.execute(text("ALTER TABLE companies ADD COLUMN rejection_reason TEXT;"))
    except Exception as e:
        print(f"Companies columns might already exist: {e}")

    print("Adding columns to internal_payments...")
    try:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE internal_payments ADD COLUMN employee_name VARCHAR(200) DEFAULT '';"))
    except Exception as e:
        print(f"Internal payments columns might already exist: {e}")
        
    print("Creating audit_logs table...")
    try:
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id),
                    action VARCHAR(255) NOT NULL,
                    module VARCHAR(50),
                    record_id VARCHAR(50),
                    record_type VARCHAR(50),
                    old_values JSON,
                    new_values JSON,
                    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
                    ip_address VARCHAR(45),
                    user_agent VARCHAR(500)
                );
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_logs_id ON audit_logs(id);"))
    except Exception as e:
        print(f"Error creating audit_logs: {e}")

    print("Database update complete!")

if __name__ == "__main__":
    main()
