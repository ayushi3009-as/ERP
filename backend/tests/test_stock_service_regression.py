"""
Regression tests for stock_service.py's corrected balance/cost logic --
written BEFORE any inventory.py/purchase.py call site was redirected to
use these functions, per the explicit "map, compare, write regression
tests, only then consolidate" methodology for this blocker. These tests
encode the exact behavior the old inline duplicates had, so consolidating
onto stock_service can be verified not to silently change it.

STATUS: syntax-verified (`ast.parse`) only. NOT EXECUTED -- see
tests/conftest.py docstring for why and how to run these for real.
"""
import pytest
from decimal import Decimal

from app.services import stock_service


@pytest.fixture()
def product_and_warehouses(db, tenant):
    from app.models.models import Product, Warehouse
    product = Product(company_id=tenant.company_id, sku="STOCKTEST1", name="Stock Test Product")
    wh1 = Warehouse(company_id=tenant.company_id, factory_id=tenant.factory_id, code="WHA", name="Warehouse A")
    wh2 = Warehouse(company_id=tenant.company_id, factory_id=tenant.factory_id, code="WHB", name="Warehouse B")
    db.add_all([product, wh1, wh2])
    db.flush()
    return product, wh1, wh2


# ==================== Weighted-average cost (divergence #1) ====================


def test_first_incoming_movement_sets_avg_cost_directly(db, tenant, product_and_warehouses):
    from app.models.models import StockMovementType
    product, wh1, _ = product_and_warehouses
    stock_service.post_stock_movement(db, tenant, product.id, wh1.id, StockMovementType.IN, quantity=100, unit_cost=10)
    balance = stock_service.get_or_create_balance(db, tenant, product.id, wh1.id)
    assert balance.avg_cost == Decimal("10")
    assert balance.quantity == Decimal("100")


def test_second_incoming_movement_computes_weighted_average(db, tenant, product_and_warehouses):
    """This is the exact formula inventory.py's stock-in endpoint used
    inline before this fix: (old_qty*old_cost + new_qty*new_cost) / total_qty."""
    from app.models.models import StockMovementType
    product, wh1, _ = product_and_warehouses
    stock_service.post_stock_movement(db, tenant, product.id, wh1.id, StockMovementType.IN, quantity=100, unit_cost=10)
    stock_service.post_stock_movement(db, tenant, product.id, wh1.id, StockMovementType.IN, quantity=100, unit_cost=20)

    balance = stock_service.get_or_create_balance(db, tenant, product.id, wh1.id)
    # (100*10 + 100*20) / 200 = 15
    assert balance.avg_cost == Decimal("15")
    assert balance.quantity == Decimal("200")


def test_out_movement_does_not_change_avg_cost(db, tenant, product_and_warehouses):
    from app.models.models import StockMovementType
    product, wh1, _ = product_and_warehouses
    stock_service.post_stock_movement(db, tenant, product.id, wh1.id, StockMovementType.IN, quantity=100, unit_cost=10)
    stock_service.post_stock_movement(db, tenant, product.id, wh1.id, StockMovementType.OUT, quantity=30)

    balance = stock_service.get_or_create_balance(db, tenant, product.id, wh1.id)
    assert balance.avg_cost == Decimal("10")
    assert balance.quantity == Decimal("70")


# ==================== Reserved-quantity-aware OUT (divergence #2) ====================


def test_out_movement_rejects_exceeding_available_stock(db, tenant, product_and_warehouses):
    from app.models.models import StockMovementType
    product, wh1, _ = product_and_warehouses
    stock_service.post_stock_movement(db, tenant, product.id, wh1.id, StockMovementType.IN, quantity=100, unit_cost=10)

    balance = stock_service.get_or_create_balance(db, tenant, product.id, wh1.id)
    balance.reserved_quantity = Decimal("80")  # only 20 actually available

    with pytest.raises(stock_service.StockError, match="Insufficient available stock"):
        stock_service.post_stock_movement(db, tenant, product.id, wh1.id, StockMovementType.OUT, quantity=30)


def test_out_movement_allows_exactly_available_stock(db, tenant, product_and_warehouses):
    from app.models.models import StockMovementType
    product, wh1, _ = product_and_warehouses
    stock_service.post_stock_movement(db, tenant, product.id, wh1.id, StockMovementType.IN, quantity=100, unit_cost=10)

    balance = stock_service.get_or_create_balance(db, tenant, product.id, wh1.id)
    balance.reserved_quantity = Decimal("50")

    # exactly 50 available -- should succeed, not raise
    stock_service.post_stock_movement(db, tenant, product.id, wh1.id, StockMovementType.OUT, quantity=50)
    assert balance.quantity == Decimal("50")


def test_out_movement_check_reserved_false_bypasses_the_check(db, tenant, product_and_warehouses):
    """Escape hatch for callers that have already validated availability
    themselves (or intentionally allow going negative, e.g. correcting a
    known data error) -- must be explicit, not the default."""
    from app.models.models import StockMovementType
    product, wh1, _ = product_and_warehouses
    stock_service.post_stock_movement(db, tenant, product.id, wh1.id, StockMovementType.IN, quantity=10, unit_cost=10)
    stock_service.post_stock_movement(db, tenant, product.id, wh1.id, StockMovementType.OUT, quantity=50, check_reserved=False)
    balance = stock_service.get_or_create_balance(db, tenant, product.id, wh1.id)
    assert balance.quantity == Decimal("-40")


def test_post_stock_movement_rejects_transfer_type(db, tenant, product_and_warehouses):
    """TRANSFER must go through transfer_stock(), never post_stock_movement()
    -- the old code's ambiguous handling of TRANSFER (divergence #3) is
    not silently preserved, it's explicitly blocked."""
    from app.models.models import StockMovementType
    product, wh1, _ = product_and_warehouses
    with pytest.raises(stock_service.StockError, match="Use transfer_stock"):
        stock_service.post_stock_movement(db, tenant, product.id, wh1.id, StockMovementType.TRANSFER, quantity=10)


# ==================== Transfer semantics (divergence #3) ====================


def test_transfer_decrements_source_and_increments_destination(db, tenant, product_and_warehouses):
    product, wh1, wh2 = product_and_warehouses
    from app.models.models import StockMovementType
    stock_service.post_stock_movement(db, tenant, product.id, wh1.id, StockMovementType.IN, quantity=100, unit_cost=10)

    stock_service.transfer_stock(db, tenant, product.id, wh1.id, wh2.id, quantity=40)

    source_balance = stock_service.get_or_create_balance(db, tenant, product.id, wh1.id)
    dest_balance = stock_service.get_or_create_balance(db, tenant, product.id, wh2.id)
    assert source_balance.quantity == Decimal("60")
    assert dest_balance.quantity == Decimal("40")


def test_transfer_carries_cost_basis_to_destination(db, tenant, product_and_warehouses):
    product, wh1, wh2 = product_and_warehouses
    from app.models.models import StockMovementType
    stock_service.post_stock_movement(db, tenant, product.id, wh1.id, StockMovementType.IN, quantity=100, unit_cost=25)

    stock_service.transfer_stock(db, tenant, product.id, wh1.id, wh2.id, quantity=40)

    dest_balance = stock_service.get_or_create_balance(db, tenant, product.id, wh2.id)
    assert dest_balance.avg_cost == Decimal("25")


def test_transfer_rejects_exceeding_available_stock(db, tenant, product_and_warehouses):
    product, wh1, wh2 = product_and_warehouses
    from app.models.models import StockMovementType
    stock_service.post_stock_movement(db, tenant, product.id, wh1.id, StockMovementType.IN, quantity=10, unit_cost=10)

    with pytest.raises(stock_service.StockError, match="Insufficient available stock"):
        stock_service.transfer_stock(db, tenant, product.id, wh1.id, wh2.id, quantity=50)


def test_transfer_rejects_nonpositive_quantity(db, tenant, product_and_warehouses):
    product, wh1, wh2 = product_and_warehouses
    with pytest.raises(stock_service.StockError, match="must be positive"):
        stock_service.transfer_stock(db, tenant, product.id, wh1.id, wh2.id, quantity=0)


def test_transfer_creates_two_ledger_entries(db, tenant, product_and_warehouses):
    product, wh1, wh2 = product_and_warehouses
    from app.models.models import StockMovementType
    stock_service.post_stock_movement(db, tenant, product.id, wh1.id, StockMovementType.IN, quantity=100, unit_cost=10)

    from_entry, to_entry = stock_service.transfer_stock(db, tenant, product.id, wh1.id, wh2.id, quantity=40)
    assert from_entry.warehouse_id == wh1.id
    assert to_entry.warehouse_id == wh2.id
    assert from_entry.movement_type == StockMovementType.TRANSFER
    assert to_entry.movement_type == StockMovementType.TRANSFER


# ==================== Physical count (divergence #4) ====================


def test_physical_count_sets_absolute_quantity_not_delta(db, tenant, product_and_warehouses):
    product, wh1, _ = product_and_warehouses
    from app.models.models import StockMovementType
    stock_service.post_stock_movement(db, tenant, product.id, wh1.id, StockMovementType.IN, quantity=100, unit_cost=10)

    stock_service.set_physical_count(db, tenant, product.id, wh1.id, physical_quantity=85)

    balance = stock_service.get_or_create_balance(db, tenant, product.id, wh1.id)
    assert balance.quantity == Decimal("85")  # SET to 85, not 100-85 or 100+85


def test_physical_count_records_signed_difference_in_ledger(db, tenant, product_and_warehouses):
    product, wh1, _ = product_and_warehouses
    from app.models.models import StockMovementType
    stock_service.post_stock_movement(db, tenant, product.id, wh1.id, StockMovementType.IN, quantity=100, unit_cost=10)

    entry = stock_service.set_physical_count(db, tenant, product.id, wh1.id, physical_quantity=85)
    assert entry.quantity == Decimal("-15")  # found 15 less than system expected


def test_physical_count_matching_system_quantity_returns_none(db, tenant, product_and_warehouses):
    """No discrepancy = nothing to record -- matches inventory.py's
    original behavior of only creating a ledger entry when diff != 0."""
    product, wh1, _ = product_and_warehouses
    from app.models.models import StockMovementType
    stock_service.post_stock_movement(db, tenant, product.id, wh1.id, StockMovementType.IN, quantity=100, unit_cost=10)

    entry = stock_service.set_physical_count(db, tenant, product.id, wh1.id, physical_quantity=100)
    assert entry is None


def test_physical_count_does_not_change_avg_cost(db, tenant, product_and_warehouses):
    """A count correction isn't a purchase -- there's no new cost basis,
    so avg_cost must be left alone even when the count finds MORE stock
    than expected."""
    product, wh1, _ = product_and_warehouses
    from app.models.models import StockMovementType
    stock_service.post_stock_movement(db, tenant, product.id, wh1.id, StockMovementType.IN, quantity=100, unit_cost=10)

    stock_service.set_physical_count(db, tenant, product.id, wh1.id, physical_quantity=120)

    balance = stock_service.get_or_create_balance(db, tenant, product.id, wh1.id)
    assert balance.avg_cost == Decimal("10")


# ==================== Tenant stamping (the purchase.py severity finding) ====================


def test_get_or_create_balance_always_stamps_tenant(db, tenant, product_and_warehouses):
    """Directly guards against the severe bug found in purchase.py's own
    duplicate _get_or_create_balance(), which never set company_id/
    factory_id at all -- every StockBalance created through this module
    must have both set, always."""
    product, wh1, _ = product_and_warehouses
    balance = stock_service.get_or_create_balance(db, tenant, product.id, wh1.id)
    assert balance.company_id == tenant.company_id
    assert balance.factory_id == tenant.factory_id


def test_post_stock_movement_always_stamps_tenant_on_ledger(db, tenant, product_and_warehouses):
    from app.models.models import StockMovementType
    product, wh1, _ = product_and_warehouses
    entry = stock_service.post_stock_movement(db, tenant, product.id, wh1.id, StockMovementType.IN, quantity=10, unit_cost=5)
    assert entry.company_id == tenant.company_id
    assert entry.factory_id == tenant.factory_id
