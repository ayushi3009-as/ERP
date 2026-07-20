from app.core.database import SessionLocal
from app.models.models import User, Company
from app.core.security import get_password_hash

def seed():
    db = SessionLocal()
    
    # Check if admin already exists
    admin = db.query(User).filter(User.email == "admin@microerp.com").first()
    if not admin:
        # Create a default company
        company = Company(
            name="Micro ERP Mfg"
        )
        db.add(company)
        db.commit()
        db.refresh(company)

        from app.models.models import Factory
        factory = Factory(
            name="Main Factory",
            company_id=company.id,
            is_default=True
        )
        db.add(factory)
        db.commit()
        db.refresh(factory)

        admin_user = User(
            email="admin@microerp.com",
            username="admin",
            password_hash=get_password_hash("admin123"),
            full_name="System Admin",
            role="company_admin",
            company_id=company.id,
            factory_id=factory.id,
            is_active=True
        )
        db.add(admin_user)
        db.commit()
        
        print("Successfully created admin user: admin@microerp.com / admin123")
    else:
        print("Admin user already exists!")
        
    db.close()

if __name__ == "__main__":
    seed()
