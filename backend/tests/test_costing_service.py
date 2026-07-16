"""
Unit tests for app.services.costing_service (module 12.5).

STATUS: syntax-verified (`ast.parse`) only. NOT EXECUTED -- see
tests/conftest.py docstring for why and how to run these for real.
"""
import pytest
from datetime import date
from decimal import Decimal

from app.services import costing_service


@pytest.fixture()
def sample_lot(db, tenant, sample_bundle):
    """Reuses sample_bundle's production_order to build a minimal Lot."""
    from app.models.models import Lot, Style, LotStatus
    style = Style(company_id=tenant.company_id, code="STY01", name="Test Style")
    db.add(style)
    db.flush()
    lot = Lot(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        lot_number="LOT00001", production_order_id=sample_bundle.production_order_id,
        style_id=style.id, status=LotStatus.CUT, total_pieces_cut=50,
        total_fabric_issued_meters=Decimal("100"), fabric_wastage_meters=Decimal("5"),
        cutting_date=date.today(),
    )
    db.add(lot)
    db.flush()
    return lot


def test_get_fabric_cost_zero_when_no_issues(db, tenant, sample_lot):
    result = costing_service.get_fabric_cost(db, tenant, sample_lot)
    assert result["total_fabric_cost"] == 0.0
    assert result["cost_per_piece"] is None  # no meters issued yet, not fabricated as 0


def test_get_accessory_cost_no_bom_returns_zero_with_note(db, tenant, sample_lot):
    result = costing_service.get_accessory_cost(db, tenant, sample_lot)
    assert result["total_accessory_cost"] == 0.0
    assert "No approved BOM" in result["note"]


def test_get_labor_cost_zero_when_no_scans(db, tenant, sample_lot):
    result = costing_service.get_labor_cost(db, tenant, sample_lot)
    assert result["confirmed_labor_cost"] == 0.0
    assert result["provisional_labor_cost"] == 0.0


def test_get_packing_cost_zero_when_nothing_recorded(db, tenant, sample_lot):
    result = costing_service.get_packing_cost(db, tenant, sample_lot)
    assert result["total_packing_cost"] == 0.0


def test_record_packing_consumption_uses_product_cost_price_by_default(db, tenant, sample_lot):
    from app.models.models import Product, Warehouse
    product = Product(company_id=tenant.company_id, sku="POLY01", name="Poly Bag", cost_price=Decimal("2.50"))
    db.add(product)
    warehouse = Warehouse(company_id=tenant.company_id, factory_id=tenant.factory_id, code="WH1", name="Main")
    db.add(warehouse)
    db.flush()

    result = costing_service.record_packing_consumption(
        db, tenant, sample_lot, actor_user_id=1, product_id=product.id,
        quantity=100, warehouse_id=warehouse.id,
    )
    assert result["total_cost"] == pytest.approx(250.0)

    packing_cost = costing_service.get_packing_cost(db, tenant, sample_lot)
    assert packing_cost["total_packing_cost"] == pytest.approx(250.0)


def test_generate_cost_sheet_excludes_provisional_labor_from_total(db, tenant, sample_lot, sample_bundle, sample_employee):
    from app.models.models import BundleScanEvent
    sample_bundle.lot_id = sample_lot.id
    db.flush()
    scan = BundleScanEvent(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        bundle_id=sample_bundle.id, employee_id=sample_employee.id,
        quantity=sample_bundle.quantity, amount_earned=Decimal("500"), scanned_at=date.today(),
    )
    db.add(scan)
    db.flush()

    sheet = costing_service.generate_cost_sheet(db, tenant, sample_lot)
    # no APPROVED salary slip exists for this employee/period -> all provisional, none confirmed
    assert sheet["labor_cost"]["confirmed_labor_cost"] == 0.0
    assert sheet["labor_cost"]["provisional_labor_cost"] == 500.0
    # total_cost must NOT include the provisional amount
    assert sheet["total_cost"] < 500.0


def test_get_variance_analysis_no_bom_returns_none_not_zero(db, tenant, sample_lot):
    result = costing_service.get_variance_analysis(db, tenant, sample_lot)
    assert result["material_variance"] is None


def test_get_profit_analysis_no_selling_price_returns_none_not_zero(db, tenant, sample_lot):
    result = costing_service.get_profit_analysis(db, tenant, sample_lot)
    assert result["gross_profit"] is None
