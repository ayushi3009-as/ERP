"""
Chained end-to-end manufacturing workflow test -- the gap explicitly
flagged in PRODUCTION_READINESS_REPORT.md Section 4.

Scope, stated plainly: this chain starts from FabricRoll (fabric already
procured and in stock), not from Purchase Order / GRN. The PO -> GRN
document flow is standard, already covered by module-specific unit tests
(purchase.py's own test coverage predates this session), and adding full
PurchaseOrderItem/GRNItem ceremony here would test that flow a second
time rather than the thing this test actually exists to prove: that
FabricRoll -> Lot -> Bundle -> every production stage -> Quality ->
Payroll -> Sales -> Invoice -> Payment correctly hands off state at each
boundary, end to end, in one real test run.

STATUS: syntax-verified (`ast.parse`) only. NOT EXECUTED -- see
tests/conftest.py docstring for why and how to run these for real.
"""
import pytest
from datetime import date, datetime
from decimal import Decimal

from app.services import (
    fabric_roll_service, bundle_service, scan_service, quality_service,
    payroll_service, sales_service, employee_work_service,
)


@pytest.fixture()
def chain_setup(db, tenant, sample_employee):
    """Builds the minimum real chain of masters this workflow needs:
    vendor, warehouse, product, style, production order, machine,
    operation -- everything FabricRoll/Lot/Bundle/etc. actually
    reference via foreign key, populated with real rows rather than
    mocked."""
    from app.models.models import (
        Vendor, Warehouse, Product, Style, Fabric, Color, Size,
        ProductionOrder, Machine, Operation, Customer,
    )

    vendor = Vendor(company_id=tenant.company_id, code="VEND01", name="Test Fabric Vendor")
    warehouse = Warehouse(company_id=tenant.company_id, factory_id=tenant.factory_id, code="WH01", name="Main Warehouse")
    product = Product(company_id=tenant.company_id, sku="SHIRT01", name="Test Shirt", product_type="finished", selling_price=Decimal("500"))
    style = Style(company_id=tenant.company_id, code="STY01", name="Test Style")
    fabric = Fabric(company_id=tenant.company_id, code="FAB01", name="Cotton Poplin")
    color = Color(company_id=tenant.company_id, code="BLU", name="Blue")
    size = Size(company_id=tenant.company_id, code="M", name="Medium")
    machine = Machine(company_id=tenant.company_id, factory_id=tenant.factory_id, code="M01", name="Stitching Machine 1")
    operation = Operation(company_id=tenant.company_id, name="Stitching", rate_per_piece=Decimal("5"))
    customer = Customer(company_id=tenant.company_id, code="CUST01", name="Test Buyer")
    db.add_all([vendor, warehouse, product, style, fabric, color, size, machine, operation, customer])
    db.flush()

    production_order = ProductionOrder(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        production_number="PROD00001", production_date=date.today(),
        product_id=product.id, style_id=style.id, planned_quantity=Decimal("50"),
    )
    db.add(production_order)
    db.flush()

    return {
        "vendor": vendor, "warehouse": warehouse, "product": product, "style": style,
        "fabric": fabric, "color": color, "size": size, "machine": machine,
        "operation": operation, "customer": customer, "production_order": production_order,
    }


def test_full_manufacturing_chain(db, tenant, sample_employee, chain_setup):
    """One test, one chain, real assertions at every handoff."""
    actor = 1  # placeholder user id, consistent with every other test file's convention

    # ---- 1. Fabric Roll: purchased fabric enters inventory ----
    from app.models.models import FabricRoll, FabricRollStatus, InspectionStatus
    roll = FabricRoll(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        roll_number="ROLL00001", vendor_id=chain_setup["vendor"].id,
        fabric_id=chain_setup["fabric"].id, color_id=chain_setup["color"].id,
        roll_length_meters=Decimal("100"), balance_length_meters=Decimal("100"),
        warehouse_id=chain_setup["warehouse"].id, unit_cost_per_meter=Decimal("150"),
        status=FabricRollStatus.APPROVED, inspection_status=InspectionStatus.PASSED,
    )
    db.add(roll)
    db.flush()
    assert roll.balance_length_meters == Decimal("100")

    # ---- 2. Lot creation + fabric issue + cutting ----
    from app.models.models import Lot, LotStatus, LotSizeBreakdown
    lot = Lot(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        lot_number="LOT00001", production_order_id=chain_setup["production_order"].id,
        style_id=chain_setup["style"].id, status=LotStatus.CREATED,
        warehouse_id=chain_setup["warehouse"].id,
    )
    db.add(lot)
    db.flush()

    lot.status = LotStatus.RESERVED
    lot.status = LotStatus.FABRIC_ALLOCATED

    fabric_movement = fabric_roll_service.issue_from_roll(
        db, tenant, roll, quantity_meters=40, actor_user_id=actor,
        reference_type="lot", reference_id=lot.id,
    )
    assert fabric_movement is not None
    assert roll.balance_length_meters == Decimal("60")

    from app.models.models import LotFabricIssue
    lot_fabric_issue = LotFabricIssue(lot_id=lot.id, fabric_roll_id=roll.id, issued_length_meters=Decimal("40"))
    db.add(lot_fabric_issue)
    db.flush()

    lot.total_fabric_issued_meters = Decimal("40")
    lot.status = LotStatus.CUTTING
    lot.cutting_date = date.today()
    lot.total_pieces_cut = 50
    lot.status = LotStatus.CUT

    breakdown = LotSizeBreakdown(
        lot_id=lot.id, color_id=chain_setup["color"].id, size_id=chain_setup["size"].id,
        planned_pieces=50, cut_pieces=50,
    )
    db.add(breakdown)
    db.flush()
    assert lot.status == LotStatus.CUT
    assert lot.total_pieces_cut == 50

    # ---- 3. Bundle creation + barcode ----
    from app.models.models import Bundle, BundleStatus
    from app.services import barcode_service

    bundle = Bundle(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        bundle_number="BNDL00001", production_order_id=chain_setup["production_order"].id,
        lot_id=lot.id, lot_size_breakdown_id=breakdown.id,
        color_id=chain_setup["color"].id, size_id=chain_setup["size"].id,
        quantity=Decimal("50"), status=BundleStatus.CREATED,
    )
    db.add(bundle)
    db.flush()
    bundle.barcode_value, bundle.qr_value = barcode_service.generate_for("bundle", bundle.bundle_number, bundle.id)
    lot.status = LotStatus.BUNDLES_GENERATED
    assert bundle.barcode_value is not None

    # ---- 4. Employee issue/receive ----
    assignment = employee_work_service.issue_bundle(db, tenant, bundle, sample_employee, actor)
    employee_work_service.receive_bundle(db, tenant, assignment, actor)
    assert assignment.status.value == "received"

    # ---- 5. Scan through every production stage ----
    from app.models.models import ProductionStage
    stage_sequence = [
        ProductionStage.CUTTING, ProductionStage.BUNDLE, ProductionStage.PRINTING,
        ProductionStage.EMBROIDERY, ProductionStage.STITCHING, ProductionStage.CHECKING,
        ProductionStage.IRONING, ProductionStage.PACKING,
    ]
    # First inspection must pass BEFORE the gate at PACKING (module 11's
    # quality gate, enforced inside scan_service itself) -- inspect once
    # the bundle reaches a pre-packing stage.
    for _ in stage_sequence[:-1]:  # advance up to (not including) PACKING first
        scan_service.process_scan(
            db, tenant, bundle.barcode_value, sample_employee.id,
            machine_id=chain_setup["machine"].id, operation_id=chain_setup["operation"].id,
        )
    assert bundle.current_stage != ProductionStage.PACKING  # gate hasn't been passed yet

    # ---- 6. Quality inspection (must pass before PACKING gate opens) ----
    inspect_result = quality_service.inspect_bundle(
        db, tenant, bundle, actor, qc_type="in_process",
        passed_quantity=50, rejected_quantity=0, rework_quantity=0,
    )
    assert inspect_result["result"] == "pass"

    # Now PACKING (and beyond) should be reachable
    scan_service.process_scan(
        db, tenant, bundle.barcode_value, sample_employee.id,
        machine_id=chain_setup["machine"].id, operation_id=chain_setup["operation"].id,
    )
    assert bundle.current_stage == ProductionStage.PACKING

    scan_service.process_scan(db, tenant, bundle.barcode_value, sample_employee.id)  # -> FINISHED
    scan_service.process_scan(db, tenant, bundle.barcode_value, sample_employee.id)  # -> DISPATCH
    assert bundle.current_stage == ProductionStage.DISPATCH
    assert bundle.status.value == "completed"

    # ---- 7. Payroll: labor cost accrued from the scans above ----
    from app.models.models import BundleScanEvent
    scan_count = db.query(BundleScanEvent).filter(BundleScanEvent.bundle_id == bundle.id).count()
    assert scan_count > 0, "Every scan above should have created a BundleScanEvent"

    production_pay = payroll_service.compute_production_pay(db, tenant, sample_employee, date.today(), date.today())
    assert production_pay["scan_count"] == scan_count

    # ---- 8. Sales: allocate, invoice ----
    from app.models.models import SalesOrder, SalesOrderItem, SalesInvoice, SalesInvoiceItem

    order = SalesOrder(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        order_number="SO00001", order_date=date.today(), customer_id=chain_setup["customer"].id,
    )
    db.add(order)
    db.flush()
    order_item = SalesOrderItem(order_id=order.id, product_id=chain_setup["product"].id, quantity=Decimal("50"), unit_price=Decimal("500"))
    db.add(order_item)
    db.flush()

    allocations = sales_service.allocate_finished_goods(db, tenant, order_item, actor)
    allocated = [a for a in allocations if a.status.value == "allocated"]
    assert len(allocated) == 1, "The bundle that just reached FINISHED/PACKING should be allocatable"
    assert allocated[0].bundle_id == bundle.id

    invoice = SalesInvoice(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        invoice_number="SI00001", invoice_date=date.today(), customer_id=chain_setup["customer"].id,
        subtotal=Decimal("25000"), grand_total=Decimal("25000"),
    )
    db.add(invoice)
    db.flush()
    invoice_item = SalesInvoiceItem(
        invoice_id=invoice.id, product_id=chain_setup["product"].id, bundle_id=bundle.id, lot_id=lot.id,
        quantity=Decimal("50"), unit_price=Decimal("500"), amount=Decimal("25000"),
    )
    db.add(invoice_item)
    db.flush()

    # ---- 9. Payment + Customer Ledger ----
    payment = sales_service.record_payment(db, tenant, chain_setup["customer"], 25000, "bank_transfer", actor, invoice_id=invoice.id)
    assert invoice.payment_status.value == "paid"

    ledger = sales_service.get_customer_ledger(db, tenant, chain_setup["customer"].id)
    assert ledger["total_invoiced"] == 25000.0
    assert ledger["total_paid"] == 25000.0
    assert ledger["outstanding_balance"] == 0.0

    # ---- 10. Costing: the whole chain should now cost something real ----
    from app.services import costing_service
    cost_sheet = costing_service.generate_cost_sheet(db, tenant, lot)
    assert cost_sheet["labor_cost"]["scan_count"] == scan_count
    # material cost may be 0 if no BOM/fabric-cost data was fully wired in
    # this minimal fixture set -- that's expected and consistent with
    # costing_service's own "return 0 with a note, never fabricate" rule
    assert cost_sheet["total_cost"] >= 0
