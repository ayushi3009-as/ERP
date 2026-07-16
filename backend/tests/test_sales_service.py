"""
Unit tests for app.services.sales_service (module 13).

STATUS: syntax-verified (`ast.parse`) only. NOT EXECUTED -- see
tests/conftest.py docstring for why and how to run these for real.
"""
import pytest
from datetime import date
from decimal import Decimal

from app.services import sales_service


@pytest.fixture()
def sample_customer(db, tenant):
    from app.models.models import Customer
    c = Customer(company_id=tenant.company_id, code="CUST01", name="Test Customer")
    db.add(c)
    db.flush()
    return c


# ==================== Finished Goods Allocation ====================


def test_allocate_finished_goods_skips_unapproved_bundles(db, tenant, sample_bundle):
    """No QualityCheck exists for sample_bundle -- it must NOT be allocated."""
    from app.models.models import SalesOrderItem, ProductionStage
    sample_bundle.current_stage = ProductionStage.PACKING
    order_item = SalesOrderItem(
        order_id=sample_bundle.production_order_id, product_id=1, quantity=Decimal("50"), unit_price=Decimal("100"),
    )
    db.add(order_item)
    db.flush()

    allocations = sales_service.allocate_finished_goods(db, tenant, order_item, actor_user_id=1)
    assert all(a.status.value == "back_order" for a in allocations)


def test_allocate_finished_goods_takes_quality_passed_bundle(db, tenant, sample_bundle, sample_employee):
    from app.models.models import SalesOrderItem, ProductionStage, QualityCheck, QCType, QCResult
    sample_bundle.current_stage = ProductionStage.PACKING
    qc = QualityCheck(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        qc_number="QC00001", qc_date=date.today(), qc_type=QCType.FINAL,
        reference_type="bundle", reference_id=sample_bundle.id,
        inspected_quantity=sample_bundle.quantity, passed_quantity=sample_bundle.quantity,
        result=QCResult.PASS,
    )
    db.add(qc)
    order_item = SalesOrderItem(
        order_id=sample_bundle.production_order_id, product_id=1,
        quantity=sample_bundle.quantity, unit_price=Decimal("100"),
    )
    db.add(order_item)
    db.flush()

    allocations = sales_service.allocate_finished_goods(db, tenant, order_item, actor_user_id=1)
    allocated = [a for a in allocations if a.status.value == "allocated"]
    assert len(allocated) == 1
    assert allocated[0].bundle_id == sample_bundle.id


def test_release_allocation_rejects_dispatched(db, tenant):
    from app.models.models import FinishedGoodsAllocation, AllocationStatus
    allocation = FinishedGoodsAllocation(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        sales_order_item_id=1, quantity=Decimal("10"), status=AllocationStatus.DISPATCHED,
    )
    db.add(allocation)
    db.flush()
    with pytest.raises(sales_service.SalesError, match="already been dispatched"):
        sales_service.release_allocation(db, tenant, allocation)


# ==================== Payments & Ledger ====================


def test_record_payment_rejects_invalid_mode(db, tenant, sample_customer):
    with pytest.raises(sales_service.SalesError, match="payment_mode must be one of"):
        sales_service.record_payment(db, tenant, sample_customer, 100, "bitcoin", actor_user_id=1)


def test_record_payment_rejects_nonpositive_amount(db, tenant, sample_customer):
    with pytest.raises(sales_service.SalesError, match="must be positive"):
        sales_service.record_payment(db, tenant, sample_customer, 0, "cash", actor_user_id=1)


def test_customer_ledger_zero_when_no_activity(db, tenant, sample_customer):
    ledger = sales_service.get_customer_ledger(db, tenant, sample_customer.id)
    assert ledger["outstanding_balance"] == 0.0
    assert ledger["invoice_count"] == 0


def test_customer_ledger_reflects_payment(db, tenant, sample_customer):
    sales_service.record_payment(db, tenant, sample_customer, 500, "bank_transfer", actor_user_id=1)
    ledger = sales_service.get_customer_ledger(db, tenant, sample_customer.id)
    assert ledger["total_paid"] == 500.0
    assert ledger["outstanding_balance"] == -500.0  # advance payment, no invoice yet


# ==================== Price List ====================


def test_resolve_customer_price_falls_back_to_catalog(db, tenant, sample_customer):
    from app.models.models import Product
    product = Product(company_id=tenant.company_id, sku="SKU99", name="Test Product", selling_price=Decimal("250"))
    db.add(product)
    db.flush()
    price = sales_service.resolve_customer_price(db, tenant, sample_customer.id, product.id)
    assert price == 250.0


def test_resolve_customer_price_prefers_price_list_entry(db, tenant, sample_customer):
    from app.models.models import Product, CustomerPriceListItem
    product = Product(company_id=tenant.company_id, sku="SKU98", name="Test Product 2", selling_price=Decimal("250"))
    db.add(product)
    db.flush()
    override = CustomerPriceListItem(
        company_id=tenant.company_id, customer_id=sample_customer.id, product_id=product.id,
        price=Decimal("200"), effective_from=date.today(),
    )
    db.add(override)
    db.flush()

    price = sales_service.resolve_customer_price(db, tenant, sample_customer.id, product.id)
    assert price == 200.0


# ==================== Sales Return / Credit Note ====================


def test_process_sales_return_rejects_invalid_disposition(db, tenant):
    from app.models.models import SalesInvoice, SalesInvoiceItem
    invoice = SalesInvoice(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        invoice_number="SI00001", invoice_date=date.today(), customer_id=1, grand_total=Decimal("1000"),
    )
    db.add(invoice)
    db.flush()
    item = SalesInvoiceItem(invoice_id=invoice.id, product_id=1, quantity=Decimal("10"), unit_price=Decimal("100"))
    db.add(item)
    db.flush()

    with pytest.raises(sales_service.SalesError, match="disposition must be"):
        sales_service.process_sales_return(db, tenant, item, 5, "defect", actor_user_id=1, disposition="burn")


def test_process_sales_return_rejects_quantity_exceeding_invoiced(db, tenant):
    from app.models.models import SalesInvoice, SalesInvoiceItem
    invoice = SalesInvoice(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        invoice_number="SI00002", invoice_date=date.today(), customer_id=1, grand_total=Decimal("1000"),
    )
    db.add(invoice)
    db.flush()
    item = SalesInvoiceItem(invoice_id=invoice.id, product_id=1, quantity=Decimal("10"), unit_price=Decimal("100"))
    db.add(item)
    db.flush()

    with pytest.raises(sales_service.SalesError, match="not exceed"):
        sales_service.process_sales_return(db, tenant, item, 20, "defect", actor_user_id=1)
