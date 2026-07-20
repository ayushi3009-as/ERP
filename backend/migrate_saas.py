import sqlite3

conn = sqlite3.connect('microerp.db')
c = conn.cursor()

try:
    c.execute("ALTER TABLE companies ADD COLUMN is_approved BOOLEAN DEFAULT 0")
    print("Added is_approved")
except Exception as e:
    print("is_approved:", e)

try:
    c.execute("ALTER TABLE companies ADD COLUMN subscription_plan VARCHAR(50) DEFAULT 'trial'")
    print("Added subscription_plan")
except Exception as e:
    print("subscription_plan:", e)

try:
    c.execute("ALTER TABLE companies ADD COLUMN subscription_expiry DATETIME")
    print("Added subscription_expiry")
except Exception as e:
    print("subscription_expiry:", e)

try:
    c.execute("ALTER TABLE companies ADD COLUMN tenant_status VARCHAR(50) DEFAULT 'pending'")
    print("Added tenant_status")
except Exception as e:
    print("tenant_status:", e)

conn.commit()
print("Migration completed!")
