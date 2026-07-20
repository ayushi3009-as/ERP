import sqlite3
conn = sqlite3.connect('microerp.db')
c = conn.cursor()
try:
    c.execute("ALTER TABLE companies ADD COLUMN payment_screenshot_url VARCHAR(500)")
    c.execute("ALTER TABLE companies ADD COLUMN rejection_reason TEXT")
    conn.commit()
    print("Migration successful")
except Exception as e:
    print("Migration error:", e)
