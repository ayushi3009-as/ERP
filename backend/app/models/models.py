from app.core.database import Base
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    Float,
    Text,
    ForeignKey,
    Enum,
    JSON,
    Date,
    BigInteger,
    Numeric,
    Index,
)
from sqlalchemy.orm import relationship, declared_attr
from sqlalchemy.sql import func
import enum


# ==================== ENUMS ====================


class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    COMPANY_ADMIN = "company_admin"
    FACTORY_MANAGER = "factory_manager"
    PRODUCTION_MANAGER = "production_manager"
    PURCHASE_MANAGER = "purchase_manager"
    SALES_MANAGER = "sales_manager"
    STORE_MANAGER = "store_manager"
    HR = "hr"
    ACCOUNTANT = "accountant"
    QUALITY = "quality"
    OPERATOR = "operator"
    WORKER = "worker"


class Gender(str, enum.Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


class DocumentStatus(str, enum.Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class PaymentStatus(str, enum.Enum):
    UNPAID = "unpaid"
    PARTIAL = "partial"
    PAID = "paid"
    OVERDUE = "overdue"


class StockMovementType(str, enum.Enum):
    IN = "in"
    OUT = "out"
    TRANSFER = "transfer"
    ADJUSTMENT = "adjustment"


class ProductionStage(str, enum.Enum):
    PLANNING = "planning"
    CUTTING = "cutting"
    BUNDLE = "bundle"
    PRINTING = "printing"
    EMBROIDERY = "embroidery"
    STITCHING = "stitching"
    CHECKING = "checking"
    IRONING = "ironing"
    PACKING = "packing"
    FINISHED = "finished"
    DISPATCH = "dispatch"


class QCType(str, enum.Enum):
    INCOMING = "incoming"
    IN_PROCESS = "in_process"
    FINAL = "final"


class QCResult(str, enum.Enum):
    PASS = "pass"
    FAIL = "fail"
    REWORK = "rework"


class AttendanceStatus(str, enum.Enum):
    PRESENT = "present"
    ABSENT = "absent"
    HALF_DAY = "half_day"
    LEAVE = "leave"
    HOLIDAY = "holiday"


# ==================== BASE MODEL ====================


class TimestampMixin:
    """Audit-only mixin. Used by truly global tables (Company, Factory,
    NumberSeries-parent, User) that must not be scoped to themselves."""

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    is_deleted = Column(Boolean, default=False)


class CompanyScopedMixin(TimestampMixin):
    """For company-wide masters shared across all factories of a company
    (e.g. Customer, Product, Style, Fabric, Color, Size, chart of Accounts).
    company_id is required for every row."""

    @declared_attr
    def company_id(cls):
        return Column(
            Integer, ForeignKey("companies.id"), nullable=False, index=True
        )


class FactoryScopedMixin(CompanyScopedMixin):
    """For floor/branch-level operational tables (Warehouse, Machine,
    Employee, ProductionOrder, Bundle, Lot, invoices, stock, payroll, ...).
    factory_id is required for every row."""

    @declared_attr
    def factory_id(cls):
        return Column(
            Integer, ForeignKey("factories.id"), nullable=False, index=True
        )


# ==================== MULTI-COMPANY / MULTI-FACTORY ====================


class Factory(TimestampMixin, Base):
    __tablename__ = "factories"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    code = Column(String(20), nullable=True)
    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    pincode = Column(String(10), nullable=True)
    gst_number = Column(String(15), nullable=True)  # factories can have separate GSTINs
    is_default = Column(Boolean, default=False)

    company = relationship("Company", foreign_keys=[company_id])
    production_lines = relationship(
        "ProductionLine", back_populates="factory", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_factory_company_default", "company_id", "is_default"),
    )


class ProductionLine(FactoryScopedMixin, Base):
    __tablename__ = "production_lines"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    code = Column(String(20), nullable=True)
    line_type = Column(String(50), nullable=True)  # cutting, stitching, finishing, mixed
    capacity_per_day = Column(Integer, default=0)
    supervisor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_active_line = Column(Boolean, default=True)

    factory = relationship("Factory", back_populates="production_lines")
    supervisor = relationship("User", foreign_keys=[supervisor_id])


# ==================== AUTH & USERS ====================


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    phone = Column(String(20), nullable=True)
    role = Column(Enum(UserRole), default=UserRole.OPERATOR, nullable=False)
    # Nullable by design (unlike CompanyScopedMixin/FactoryScopedMixin):
    # super_admin -> both NULL (platform-wide). company_admin -> company_id
    # set, factory_id NULL (whole company). Everyone else -> both set.
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    factory_id = Column(Integer, ForeignKey("factories.id"), nullable=True, index=True)
    avatar_url = Column(String(500), nullable=True)
    is_verified = Column(Boolean, default=False)
    totp_secret = Column(String(32), nullable=True)
    totp_enabled = Column(Boolean, default=False)
    last_login = Column(DateTime(timezone=True), nullable=True)
    failed_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    
    # Operator specific fields
    employee_id = Column(String(50), nullable=True)
    barcode = Column(String(255), nullable=True)
    joined_date = Column(Date, nullable=True)

    sessions = relationship(
        "UserSession",
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="UserSession.user_id",
    )
    audit_logs = relationship(
        "AuditLog", back_populates="user", foreign_keys="AuditLog.user_id"
    )


class UserSession(TimestampMixin, Base):
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    refresh_token = Column(Text, nullable=False)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    is_revoked = Column(Boolean, default=False)

    user = relationship("User", back_populates="sessions", foreign_keys=[user_id])


# ==================== COMPANY ====================


class Company(TimestampMixin, Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    short_name = Column(String(50), nullable=True)
    logo_url = Column(String(500), nullable=True)
    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    pincode = Column(String(10), nullable=True)
    country = Column(String(100), default="India")
    phone = Column(String(20), nullable=True)
    email = Column(String(255), nullable=True)
    website = Column(String(255), nullable=True)
    gst_number = Column(String(15), nullable=True)
    pan_number = Column(String(10), nullable=True)
    tan_number = Column(String(10), nullable=True)
    cin_number = Column(String(21), nullable=True)
    iec_code = Column(String(10), nullable=True)
    financial_year_start = Column(String(10), default="04-01")
    financial_year_end = Column(String(10), default="03-31")
    currency = Column(String(3), default="INR")
    settings = Column(JSON, default=dict)
    
    # SaaS Multi-Tenancy Fields
    is_approved = Column(Boolean, default=False)
    subscription_plan = Column(String(50), default="trial")
    subscription_expiry = Column(DateTime(timezone=True), nullable=True)
    tenant_status = Column(String(50), default="pending")
    payment_screenshot_url = Column(String(500), nullable=True)
    rejection_reason = Column(Text, nullable=True)


class NumberSeries(FactoryScopedMixin, Base):
    __tablename__ = "number_series"

    id = Column(Integer, primary_key=True, index=True)
    series_name = Column(String(100), nullable=False)
    prefix = Column(String(20), nullable=False)
    current_number = Column(Integer, default=0)
    pad_length = Column(Integer, default=5)
    suffix = Column(String(20), nullable=True)
    module = Column(String(50), nullable=False)


# ==================== GARMENT MASTERS ====================



# ==================== NEW MANUFACTURING MASTERS ====================

class Category(CompanyScopedMixin, Base):
    __tablename__ = 'categories'
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

class Fabric(CompanyScopedMixin, Base):
    __tablename__ = 'fabrics'
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    fabric_type = Column(String(100), nullable=True)
    gsm = Column(String(50), nullable=True)
    composition = Column(String(255), nullable=True)
    color = Column(String(100), nullable=True)

class Product(CompanyScopedMixin, Base):
    __tablename__ = 'products'
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(100), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    category_id = Column(Integer, ForeignKey('categories.id'), nullable=True)
    fabric_id = Column(Integer, ForeignKey('fabrics.id'), nullable=True)
    available_sizes = Column(JSON, nullable=True)
    image_url = Column(String(500), nullable=True)
    
    category = relationship('Category')
    fabric = relationship('Fabric')

    @property
    def category_name(self):
        return self.category.name if self.category else None

    @property
    def fabric_name(self):
        return self.fabric.name if self.fabric else None

class Design(CompanyScopedMixin, Base):
    __tablename__ = 'designs'
    id = Column(Integer, primary_key=True, index=True)
    design_number = Column(String(100), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    product_id = Column(Integer, ForeignKey('products.id'), nullable=True)
    category_id = Column(Integer, ForeignKey('categories.id'), nullable=True)
    fabric_id = Column(Integer, ForeignKey('fabrics.id'), nullable=True)
    image_url = Column(String(500), nullable=True)
    version = Column(String(50), nullable=True)

    product = relationship('Product')
    category = relationship('Category')
    fabric = relationship('Fabric')

    @property
    def product_name(self):
        return self.product.name if self.product else None

    @property
    def category_name(self):
        return self.category.name if self.category else None

    @property
    def fabric_name(self):
        return self.fabric.name if self.fabric else None

class Lot(FactoryScopedMixin, Base):
    __tablename__ = 'lots'
    id = Column(Integer, primary_key=True, index=True)
    lot_number = Column(String(100), unique=True, index=True, nullable=False)
    design_id = Column(Integer, ForeignKey('designs.id'), nullable=False)
    product_id = Column(Integer, ForeignKey('products.id'), nullable=False)
    size = Column(String(50), nullable=False)
    quantity = Column(Integer, nullable=False, default=0)
    barcode = Column(String(255), unique=True, index=True, nullable=True)
    current_process = Column(String(100), nullable=True)

    design = relationship('Design')
    product = relationship('Product')

class BarcodeScanHistory(FactoryScopedMixin, Base):
    __tablename__ = 'barcode_scan_history'
    id = Column(Integer, primary_key=True, index=True)
    barcode = Column(String(255), index=True, nullable=False)
    scan_type = Column(String(50), nullable=False) # lot, employee, etc.
    scanned_by = Column(Integer, ForeignKey('users.id'), nullable=True)
    process_stage = Column(String(100), nullable=True)
    remarks = Column(Text, nullable=True)

class Service(CompanyScopedMixin, Base):
    __tablename__ = 'services'
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    process = Column(String(255), nullable=False)
    rate = Column(Numeric(15, 2), default=0)
    remarks = Column(Text, nullable=True)

class InternalPayment(FactoryScopedMixin, Base):
    __tablename__ = 'internal_payments'
    id = Column(Integer, primary_key=True, index=True)
    payment_id = Column(String(100), unique=True, nullable=False)
    payment_date = Column(DateTime(timezone=True), default=func.now())
    employee_name = Column(String(200), nullable=False, default='')
    payment_type = Column(String(100), nullable=False)
    amount = Column(Numeric(15, 2), nullable=False, default=0)
    remarks = Column(Text, nullable=True)

class Attendance(FactoryScopedMixin, Base):
    __tablename__ = 'attendances'
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    date = Column(Date, nullable=False)
    status = Column(String(50), nullable=False)
    scan_type = Column(String(50), nullable=True) # barcode, manual
    shift = Column(String(50), nullable=True)


class AuditLog(Base):
    __tablename__ = 'audit_logs'
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    action = Column(String(255), nullable=False)
    module = Column(String(50), nullable=True)
    record_id = Column(String(50), nullable=True)
    record_type = Column(String(50), nullable=True)
    old_values = Column(JSON, nullable=True)
    new_values = Column(JSON, nullable=True)
    timestamp = Column(DateTime(timezone=True), default=func.now(), nullable=False)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)

    user = relationship('User')
