from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any, TypeVar, Generic
from datetime import datetime, date

T = TypeVar("T")

class OrmModel(BaseModel):
    """Base for all response models that map to SQLAlchemy ORM objects."""
    model_config = ConfigDict(from_attributes=True)

# ==================== GENERIC SCHEMAS ====================

class PaginationParams(BaseModel):
    page: int = 1
    page_size: int = 20
    search: Optional[str] = None
    sort_by: Optional[str] = "created_at"
    sort_order: Optional[str] = "desc"

class PaginatedResponse(OrmModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int
    total_pages: int

class MessageResponse(OrmModel):
    message: str
    success: bool = True


# ==================== COMPANY SCHEMAS ====================

class CompanyBase(OrmModel):
    name: str
    code: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    cin_number: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    logo_url: Optional[str] = None
    base_currency: str = "INR"
    financial_year_start: Optional[str] = None

class CompanyCreate(CompanyBase):
    pass

class CompanyUpdate(CompanyBase):
    pass

class CompanyResponse(CompanyBase, OrmModel):
    id: int
    is_approved: bool
    subscription_plan: str
    subscription_expiry: Optional[datetime] = None
    tenant_status: str
    created_at: datetime

# ==================== AUTH / USER SCHEMAS ====================

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    user_id: int
    email: str
    role: str

class LoginRequest(BaseModel):
    email: str
    password: str
    device_id: Optional[str] = None
    device_type: Optional[str] = None

class UserBase(BaseModel):
    email: str
    username: str
    full_name: str
    phone: Optional[str] = None
    role: str = "operator"

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None

class UserResponse(UserBase, OrmModel):
    id: int
    is_active: bool
    created_at: datetime


class EmployeeCreate(UserBase):
    barcode: Optional[str] = None
    employee_id: Optional[str] = None
    joined_date: Optional[date] = None
    settings: Optional[dict] = None

class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    username: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    barcode: Optional[str] = None
    employee_id: Optional[str] = None
    joined_date: Optional[date] = None
    is_active: Optional[bool] = None
    settings: Optional[dict] = None

class EmployeeResponse(UserResponse, OrmModel):
    barcode: Optional[str] = None
    employee_id: Optional[str] = None
    joined_date: Optional[date] = None
    avatar_url: Optional[str] = None
    settings: Optional[dict] = None


# ==================== MANUFACTURING MASTERS ====================

class CategoryBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: Optional[bool] = True

class CategoryCreate(CategoryBase):
    pass

class CategoryResponse(CategoryBase, OrmModel):
    id: int
    created_at: datetime

class FabricBase(BaseModel):
    name: str
    fabric_type: Optional[str] = None
    gsm: Optional[str] = None
    composition: Optional[str] = None
    color: Optional[str] = None
    is_active: Optional[bool] = True

class FabricCreate(FabricBase):
    pass

class FabricResponse(FabricBase, OrmModel):
    id: int
    created_at: datetime

class ProductBase(BaseModel):
    code: str
    name: str
    category_id: Optional[int] = None
    fabric_id: Optional[int] = None
    category_name: Optional[str] = None
    fabric_name: Optional[str] = None
    available_sizes: Optional[List[str]] = None
    image_url: Optional[str] = None
    is_active: Optional[bool] = True

class ProductCreate(ProductBase):
    pass

class ProductResponse(ProductBase, OrmModel):
    id: int
    created_at: datetime

class DesignBase(BaseModel):
    design_number: str
    name: str
    product_id: Optional[int] = None
    category_id: Optional[int] = None
    fabric_id: Optional[int] = None
    product_name: Optional[str] = None
    category_name: Optional[str] = None
    fabric_name: Optional[str] = None
    image_url: Optional[str] = None
    version: Optional[str] = None
    is_active: Optional[bool] = True

class DesignCreate(DesignBase):
    pass

class DesignResponse(DesignBase, OrmModel):
    id: int
    created_at: datetime


# ==================== LOT & PRODUCTION SCHEMAS ====================

class LotBase(BaseModel):
    design_id: Optional[int] = None
    product_id: Optional[int] = None
    design_number: Optional[str] = None
    color: Optional[str] = None
    size: str
    quantity: int
    lot_number: Optional[str] = None
    barcode: Optional[str] = None
    current_process: Optional[str] = None

class LotCreate(LotBase):
    # lot_number and barcode are auto-generated by the backend
    pass

class LotResponse(LotBase, OrmModel):
    id: int
    lot_number: str
    barcode: Optional[str] = None
    current_process: Optional[str] = None
    created_at: datetime

class ScanRequest(BaseModel):
    barcode: str
    employee_id: Optional[int] = None

class ScanResponse(OrmModel):
    success: bool
    message: str
    lot_number: Optional[str] = None
    previous_stage: Optional[str] = None
    new_stage: Optional[str] = None

class BarcodeScanHistoryResponse(OrmModel):
    id: int
    barcode: str
    scan_type: str
    scanned_by: Optional[int] = None
    process_stage: Optional[str] = None
    remarks: Optional[str] = None
    created_at: datetime


# ==================== ATTENDANCE SCHEMAS ====================

class AttendanceBase(BaseModel):
    employee_id: int
    date: date
    status: str
    scan_type: Optional[str] = None
    shift: Optional[str] = None

class AttendanceCreate(AttendanceBase):
    pass

class AttendanceResponse(AttendanceBase, OrmModel):
    id: int
    created_at: datetime

# ==================== DASHBOARD SCHEMAS ====================
class DashboardStats(BaseModel):
    today_production: int
    pending_lots: int
    completed_lots: int
    active_employees: int

# ==================== PHASE 5 SCHEMAS ====================

class ServiceBase(BaseModel):
    name: str
    process: str
    rate: float = 0.0
    remarks: Optional[str] = None
    is_active: Optional[bool] = True

class ServiceCreate(ServiceBase):
    pass

class ServiceResponse(ServiceBase, OrmModel):
    id: int
    created_at: datetime

class InternalPaymentBase(BaseModel):
    payment_id: str
    employee_name: str
    payment_type: str
    amount: float = 0.0
    remarks: Optional[str] = None

class InternalPaymentCreate(InternalPaymentBase):
    pass

class InternalPaymentResponse(InternalPaymentBase, OrmModel):
    id: int
    payment_date: datetime
    created_at: datetime
