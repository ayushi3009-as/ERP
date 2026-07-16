from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime, date
from enum import Enum


# ==================== AUTH SCHEMAS ====================


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
    device_id: Optional[int] = None  # links this session to a MobileDevice (module 17), for logout-from-device


class RegisterRequest(BaseModel):
    email: str
    username: str
    password: str
    full_name: str
    phone: Optional[str] = None


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class TOTPSetupResponse(BaseModel):
    secret: str
    uri: str
    qr_url: Optional[str] = None


class TOTPVerifyRequest(BaseModel):
    code: str


# ==================== USER SCHEMAS ====================


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


class UserResponse(UserBase):
    id: int
    avatar_url: Optional[str] = None
    is_active: bool
    is_verified: bool
    totp_enabled: bool
    last_login: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    items: List[UserResponse]
    total: int
    page: int
    page_size: int


# ==================== COMPANY SCHEMAS ====================


class CompanyBase(BaseModel):
    name: str
    short_name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None


class CompanyCreate(CompanyBase):
    pass


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    short_name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    settings: Optional[dict] = None


class CompanyResponse(CompanyBase):
    id: int
    logo_url: Optional[str] = None
    financial_year_start: str
    financial_year_end: str
    currency: str
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== MASTER SCHEMAS ====================


class CustomerBase(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    gst_number: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    credit_limit: Optional[float] = 0
    credit_days: Optional[int] = 0


class CustomerCreate(CustomerBase):
    code: str


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    gst_number: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    credit_limit: Optional[float] = None
    credit_days: Optional[int] = None


class CustomerResponse(CustomerBase):
    id: int
    code: str
    created_at: datetime

    class Config:
        from_attributes = True


class VendorBase(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    gst_number: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    payment_terms: Optional[int] = 30
    category: Optional[str] = None


class VendorCreate(VendorBase):
    code: str


class VendorUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    gst_number: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    payment_terms: Optional[int] = None
    category: Optional[str] = None


class VendorResponse(VendorBase):
    id: int
    code: str
    created_at: datetime

    class Config:
        from_attributes = True


class ProductBase(BaseModel):
    name: str
    category_id: Optional[int] = None
    brand_id: Optional[int] = None
    product_type: str = "finished"
    unit_id: Optional[int] = None
    hsn_code: Optional[str] = None
    gst_rate: Optional[float] = 0
    description: Optional[str] = None
    cost_price: Optional[float] = 0
    selling_price: Optional[float] = 0
    mrp: Optional[float] = 0
    min_stock_level: Optional[int] = 0
    max_stock_level: Optional[int] = 0
    reorder_level: Optional[int] = 0


class ProductCreate(ProductBase):
    sku: str


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[int] = None
    brand_id: Optional[int] = None
    product_type: Optional[str] = None
    unit_id: Optional[int] = None
    hsn_code: Optional[str] = None
    gst_rate: Optional[float] = None
    description: Optional[str] = None
    cost_price: Optional[float] = None
    selling_price: Optional[float] = None
    mrp: Optional[float] = None
    min_stock_level: Optional[int] = None
    max_stock_level: Optional[int] = None
    reorder_level: Optional[int] = None


class ProductResponse(ProductBase):
    id: int
    sku: str
    barcode: Optional[str] = None
    image_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== INVENTORY SCHEMAS ====================


class StockMovementCreate(BaseModel):
    product_id: int
    warehouse_id: int
    movement_type: str
    quantity: float
    unit_cost: Optional[float] = 0
    batch_number: Optional[str] = None
    lot_number: Optional[str] = None
    roll_number: Optional[str] = None
    color_id: Optional[int] = None
    size_id: Optional[int] = None
    reference_type: Optional[str] = None
    reference_id: Optional[int] = None
    remarks: Optional[str] = None


class StockBalanceResponse(BaseModel):
    id: int
    product_id: int
    warehouse_id: int
    product_name: Optional[str] = None
    warehouse_name: Optional[str] = None
    quantity: float
    reserved_quantity: float
    damaged_quantity: float
    avg_cost: float
    color_id: Optional[int] = None
    size_id: Optional[int] = None
    batch_number: Optional[str] = None

    class Config:
        from_attributes = True


# ==================== PURCHASE SCHEMAS ====================


class PurchaseOrderItemCreate(BaseModel):
    product_id: int
    quantity: float
    unit_price: float
    discount_percent: Optional[float] = 0
    gst_rate: Optional[float] = 0
    color_id: Optional[int] = None
    size_id: Optional[int] = None
    remarks: Optional[str] = None


class PurchaseOrderCreate(BaseModel):
    vendor_id: int
    po_date: date
    expected_date: Optional[date] = None
    payment_terms: Optional[int] = 30
    items: List[PurchaseOrderItemCreate]
    discount: Optional[float] = 0
    advance_amount: Optional[float] = 0
    notes: Optional[str] = None
    terms: Optional[str] = None


class PurchaseOrderResponse(BaseModel):
    id: int
    po_number: str
    po_date: date
    vendor_id: int
    vendor_name: Optional[str] = None
    status: str
    subtotal: float
    grand_total: float
    created_at: datetime

    class Config:
        from_attributes = True


class GRNItemCreate(BaseModel):
    product_id: int
    ordered_quantity: float
    received_quantity: float
    accepted_quantity: float
    rejected_quantity: Optional[float] = 0
    unit_price: float
    batch_number: Optional[str] = None
    lot_number: Optional[str] = None
    roll_number: Optional[str] = None
    color_id: Optional[int] = None
    size_id: Optional[int] = None


class GRNCreate(BaseModel):
    order_id: int
    vendor_id: int
    grn_date: date
    warehouse_id: int
    items: List[GRNItemCreate]
    remarks: Optional[str] = None


# ==================== SALES SCHEMAS ====================


class SalesOrderItemCreate(BaseModel):
    product_id: int
    quantity: float
    unit_price: float
    discount_percent: Optional[float] = 0
    gst_rate: Optional[float] = 0
    color_id: Optional[int] = None
    size_id: Optional[int] = None
    style_id: Optional[int] = None


class SalesOrderCreate(BaseModel):
    customer_id: int
    order_date: date
    delivery_date: Optional[date] = None
    items: List[SalesOrderItemCreate]
    discount: Optional[float] = 0
    advance_amount: Optional[float] = 0
    notes: Optional[str] = None
    terms: Optional[str] = None


class SalesOrderResponse(BaseModel):
    id: int
    order_number: str
    order_date: date
    customer_id: int
    customer_name: Optional[str] = None
    status: str
    payment_status: str
    subtotal: float
    grand_total: float
    paid_amount: float
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== PRODUCTION SCHEMAS ====================


class BOMItemCreate(BaseModel):
    product_id: int
    quantity: float
    wastage_percent: Optional[float] = 0
    unit_cost: Optional[float] = 0
    color_id: Optional[int] = None
    size_id: Optional[int] = None
    remarks: Optional[str] = None


class BOMCreate(BaseModel):
    product_id: int
    style_id: Optional[int] = None
    quantity: Optional[float] = 1
    items: List[BOMItemCreate]
    remarks: Optional[str] = None


class BOMResponse(BaseModel):
    id: int
    bom_number: str
    product_id: int
    product_name: Optional[str] = None
    style_id: Optional[int] = None
    version: int
    total_cost: float
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class ProductionOrderCreate(BaseModel):
    sales_order_id: Optional[int] = None
    product_id: int
    style_id: Optional[int] = None
    bom_id: Optional[int] = None
    planned_quantity: float
    planned_start: Optional[date] = None
    planned_end: Optional[date] = None
    priority: Optional[str] = "normal"
    remarks: Optional[str] = None


class ProductionOrderResponse(BaseModel):
    id: int
    production_number: str
    production_date: date
    product_id: int
    product_name: Optional[str] = None
    planned_quantity: float
    completed_quantity: float
    current_stage: str
    status: str
    priority: str
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== PAYROLL SCHEMAS ====================


class AttendanceCreate(BaseModel):
    employee_id: int
    attendance_date: date
    status: str
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    overtime_hours: Optional[float] = 0
    pieces_completed: Optional[int] = 0
    remarks: Optional[str] = None


class SalarySlipCreate(BaseModel):
    employee_id: int
    month: int
    year: int
    basic_salary: Optional[float] = None
    hra: Optional[float] = None
    da: Optional[float] = None
    conveyance: Optional[float] = 0
    medical: Optional[float] = 0
    overtime_amount: Optional[float] = 0
    incentive: Optional[float] = 0
    piece_rate_amount: Optional[float] = 0
    pf_deduction: Optional[float] = 0
    esi_deduction: Optional[float] = 0
    tds: Optional[float] = 0
    other_deductions: Optional[float] = 0
    working_days: Optional[int] = None
    present_days: Optional[int] = None
    absent_days: Optional[int] = None
    leave_days: Optional[int] = None
    remarks: Optional[str] = None


# ==================== QUALITY SCHEMAS ====================


class QualityCheckCreate(BaseModel):
    qc_date: date
    qc_type: str
    reference_type: Optional[str] = None
    reference_id: Optional[int] = None
    product_id: Optional[int] = None
    production_order_id: Optional[int] = None
    inspected_quantity: float
    passed_quantity: Optional[float] = 0
    rejected_quantity: Optional[float] = 0
    rework_quantity: Optional[float] = 0
    inspector_id: Optional[int] = None
    defect_category_id: Optional[int] = None
    defect_description: Optional[str] = None
    remarks: Optional[str] = None


# ==================== GENERIC SCHEMAS ====================


class PaginationParams(BaseModel):
    page: int = 1
    page_size: int = 20
    search: Optional[str] = None
    sort_by: Optional[str] = "created_at"
    sort_order: Optional[str] = "desc"


class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    page_size: int
    total_pages: int


class MessageResponse(BaseModel):
    message: str
    success: bool = True


class DashboardStats(BaseModel):
    today_sales: float = 0
    today_production: int = 0
    pending_orders: int = 0
    low_stock_items: int = 0
    total_revenue: float = 0
    total_customers: int = 0
    total_products: int = 0
    production_efficiency: float = 0
    machine_utilization: float = 0
    pending_purchase_orders: int = 0
    pending_delivery: int = 0
    total_employees: int = 0
