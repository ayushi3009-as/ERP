from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    users,
    company,
    employees,
    products,
    production,
    lots,
    dashboard,
    reports,
    mobile,
    printing
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(company.router, prefix="/company", tags=["Company"])
api_router.include_router(employees.router, prefix="/employees", tags=["Employees"])
api_router.include_router(products.router, prefix="/products", tags=["Products"])
api_router.include_router(production.router, prefix="/production", tags=["Production"])
api_router.include_router(lots.router, prefix="/lots", tags=["Lots"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
api_router.include_router(reports.router, prefix="/reports", tags=["Reports"])
api_router.include_router(mobile.router, prefix="/mobile", tags=["Mobile Scanner Platform"])
api_router.include_router(printing.router, prefix="/printing", tags=["Thermal Printing & Labels"])
