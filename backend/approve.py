import sqlite3
conn = sqlite3.connect('microerp.db')
c = conn.cursor()
c.execute("UPDATE companies SET is_approved=1, tenant_status='active', subscription_plan='premium'")
conn.commit()
print('All existing companies approved for demo purposes')
