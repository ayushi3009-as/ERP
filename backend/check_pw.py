from app.core.database import SessionLocal
from app.models.models import User
from app.core.security import verify_password, get_password_hash

db = SessionLocal()
user = db.query(User).filter(User.email == 'admin@microerp.com').first()

match = verify_password('Admin@123', user.password_hash)
print(f'Match: {match}')

if not match:
    user.password_hash = get_password_hash('Admin@123')
    db.commit()
    print('Password force updated again.')
