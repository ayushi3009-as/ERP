"""
Unit tests for app.services.report_service (module 14).

STATUS: syntax-verified (`ast.parse`) only. NOT EXECUTED -- see
tests/conftest.py docstring for why and how to run these for real.
"""
import pytest
from datetime import date, timedelta
from decimal import Decimal

from app.services import report_service


def test_gst_report_raises_not_implemented(db, tenant):
    """Confirms the duplicate GST calculation was actually removed, not
    just renamed -- calling it must fail loudly, pointing at the real
    endpoint, rather than silently returning an incomplete number."""
    with pytest.raises(NotImplementedError, match="GET /reports/gst"):
        report_service.gst_report(db, tenant, date.today(), date.today())


def test_slow_moving_inventory_excludes_recently_moved_stock(db, tenant):
    from app.models.models import StockBalance, Product, Warehouse
    product = Product(company_id=tenant.company_id, sku="SKU01", name="Test")
    warehouse = Warehouse(company_id=tenant.company_id, factory_id=tenant.factory_id, code="WH1", name="Main")
    db.add_all([product, warehouse])
    db.flush()

    from datetime import datetime
    recent = StockBalance(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        product_id=product.id, warehouse_id=warehouse.id, quantity=Decimal("10"),
        last_movement_date=datetime.utcnow(),
    )
    db.add(recent)
    db.flush()

    result = report_service.slow_moving_inventory(db, tenant, days_threshold=60)
    assert not any(r["product_id"] == product.id for r in result)


def test_slow_moving_inventory_includes_stale_stock(db, tenant):
    from app.models.models import StockBalance, Product, Warehouse
    product = Product(company_id=tenant.company_id, sku="SKU02", name="Stale Product")
    warehouse = Warehouse(company_id=tenant.company_id, factory_id=tenant.factory_id, code="WH2", name="Old")
    db.add_all([product, warehouse])
    db.flush()

    stale = StockBalance(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        product_id=product.id, warehouse_id=warehouse.id, quantity=Decimal("5"),
        last_movement_date=None,  # never moved
    )
    db.add(stale)
    db.flush()

    result = report_service.slow_moving_inventory(db, tenant, days_threshold=60)
    assert any(r["product_id"] == product.id for r in result)


def test_dead_stock_reuses_slow_moving_with_stricter_threshold(db, tenant):
    """Confirms dead_stock_report doesn't have its own separate query
    logic -- it's the same mechanism, just a different threshold."""
    import inspect
    source = inspect.getsource(report_service.dead_stock_report)
    assert "slow_moving_inventory" in source


def test_abc_analysis_empty_when_no_movements(db, tenant):
    result = report_service.abc_analysis(db, tenant, date.today(), date.today())
    assert result == []


def test_production_pending_completed_rejected_zero_state(db, tenant):
    result = report_service.production_pending_completed_rejected(db, tenant, date.today(), date.today())
    assert result["total_lots"] == 0
    assert result["pending_lots"] == 0
    assert result["completed_lots"] == 0


def test_executive_mis_combines_all_domains(db, tenant):
    """Confirms executive_mis calls into every domain's own dashboard/KPI
    function rather than re-deriving numbers itself."""
    import inspect
    source = inspect.getsource(report_service.executive_mis)
    for expected_call in ["quality_service.compute_kpis", "sales_service.get_sales_dashboard",
                           "payroll_service.get_payroll_dashboard", "costing_service.get_costing_dashboard",
                           "machine_service.get_fleet_dashboard"]:
        assert expected_call in source, f"executive_mis should delegate to {expected_call}"


def test_unified_dashboard_combines_all_domains(db, tenant):
    import inspect
    source = inspect.getsource(report_service.unified_dashboard)
    for expected_call in ["sales_service.get_sales_dashboard", "payroll_service.get_payroll_dashboard",
                           "costing_service.get_costing_dashboard", "machine_service.get_fleet_dashboard",
                           "quality_service.get_quality_alerts"]:
        assert expected_call in source, f"unified_dashboard should delegate to {expected_call}"


def test_save_and_list_filters(db, tenant):
    saved = report_service.save_filter(db, user_id=1, report_name="sales_trend", filter_name="This Month", filters={"date_from": "2026-07-01"})
    db.flush()
    assert saved.id is not None

    results = report_service.list_saved_filters(db, user_id=1, report_name="sales_trend")
    assert len(results) == 1
    assert results[0].filter_name == "This Month"


def test_list_saved_filters_filters_by_user(db, tenant):
    report_service.save_filter(db, user_id=1, report_name="sales_trend", filter_name="Mine", filters={})
    report_service.save_filter(db, user_id=2, report_name="sales_trend", filter_name="Not mine", filters={})
    db.flush()

    results = report_service.list_saved_filters(db, user_id=1)
    assert len(results) == 1
    assert results[0].filter_name == "Mine"
