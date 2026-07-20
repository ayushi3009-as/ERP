import sqlite3
conn = sqlite3.connect('microerp.db')
conn.execute("ALTER TABLE internal_payments ADD COLUMN employee_name VARCHAR(200) DEFAULT ''")
conn.commit()
print('employee_name column added successfully')
conn.close()
