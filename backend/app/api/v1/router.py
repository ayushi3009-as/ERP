from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    users,
    company,
    tenant,
    employees,
    categories,
    fabrics,
    designs,
    products,
    production,
    lots,
    dashboard,
    reports,
    mobile,
    printing,
    attendance,
    services,
    payments,
    settings
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(tenant.router, prefix="/tenant", tags=["tenant"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(company.router, prefix="/company", tags=["Company"])
api_router.include_router(employees.router, prefix="/employees", tags=["employees"])
api_router.include_router(production.router, prefix="/production", tags=["Production"])
api_router.include_router(lots.router, prefix="/lots", tags=["lots"])
api_router.include_router(attendance.router, prefix="/attendance", tags=["attendance"])

# Phase 4 Product Masters
api_router.include_router(categories.router, prefix="/categories", tags=["categories"])
api_router.include_router(fabrics.router, prefix="/fabrics", tags=["fabrics"])
api_router.include_router(designs.router, prefix="/designs", tags=["designs"])
api_router.include_router(products.router, prefix="/products", tags=["products"])
api_router.include_router(services.router, prefix="/services", tags=["services"])

# Phase 5 Payroll/Payments
api_router.include_router(payments.router, prefix="/payments", tags=["payments"])

api_router.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
api_router.include_router(reports.router, prefix="/reports", tags=["Reports"])
api_router.include_router(mobile.router, prefix="/mobile", tags=["Mobile Scanner Platform"])
api_router.include_router(printing.router, prefix="/printing", tags=["Thermal Printing & Labels"])
api_router.include_router(settings.router, prefix="/settings", tags=["Settings"])
