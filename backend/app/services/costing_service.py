"""
Manufacturing Costing Engine (module 12.5) -- the ONLY source of
manufacturing cost calculation in this ERP.

Every cost component here is either read directly from an existing
table's already-computed value, or aggregated from existing records.
Nothing recomputes a number another service already owns:

  - Fabric cost      <- LotFabricIssue.issued_length_meters x
                         FabricRoll.unit_cost_per_meter (module 3/4)
  - Accessory cost    <- BOMItem.unit_cost x actual output (module 9's
                         BOM, already the "recipe")
  - Labor cost        <- payroll_service.get_bundle_eligibility_ratios()
                         x BundleScanEvent.amount_earned (module 6/12) --
                         never recomputed independently
  - Machine cost      <- machine_service.get_capacity_metrics() running
                         hours (module 10) x Machine.hourly_operating_cost
                         + MachineMaintenanceLog.cost (module 10)
  - Quality cost      <- QualityCheck/BundleReject/BundleRework counts
                         and quantities (module 11)
  - Packing cost       <- StockLedger rows with reference_type=
                         "packing_cost" (module 2's stock_service, reused
                         for recording, not a new storage layer)
  - Overhead           <- OverheadCost (genuinely new -- nothing else
                         captures indirect costs), allocated by
                         CostingPolicy.overhead_allocation_basis
"""

from typing import Optional, List
from decimal import Decimal
from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func

from app.models.models import (
    Lot,
    Bundle,
    BundleScanEvent,
    BundleReject,
    BundleRework,
    LotFabricIssue,
    FabricRoll,
    BOM,
    BOMItem,
    Machine,
    MachineMaintenanceLog,
    QualityCheck,
    QCResult,
    OverheadCost,
    CostingPolicy,
    StockMovementType,
    Product,
    DocumentStatus,
)
from app.services import payroll_service, machine_service, stock_service, realtime_service


class CostingError(ValueError):
    pass


def get_policy(db: Session, tenant) -> CostingPolicy:
    policy = (
        db.query(CostingPolicy)
        .filter(CostingPolicy.company_id == tenant.company_id, CostingPolicy.is_deleted == False)
        .first()
    )
    if not policy:
        policy = CostingPolicy(company_id=tenant.company_id)
        db.add(policy)
        db.flush()
    return policy


# ==================== MATERIAL COST ====================


def get_fabric_cost(db: Session, tenant, lot: Lot) -> dict:
    """Fabric cost is entirely a read of already-priced data -- no rate
    is resolved or recomputed here. FabricRoll.unit_cost_per_meter was
    set at GRN/purchase time (module 3); LotFabricIssue.issued_length_meters
    was recorded at fabric-issue time (module 4)."""
    issues = (
        db.query(LotFabricIssue, FabricRoll)
        .join(FabricRoll, FabricRoll.id == LotFabricIssue.fabric_roll_id)
        .filter(LotFabricIssue.lot_id == lot.id)
        .all()
    )
    total_cost = sum(
        float(issue.issued_length_meters) * float(roll.unit_cost_per_meter or 0)
        for issue, roll in issues
    )
    total_meters = sum(float(issue.issued_length_meters) for issue, _ in issues)
    wastage_meters = float(lot.fabric_wastage_meters or 0)
    useful_meters = max(total_meters - wastage_meters, 0)

    pieces = lot.total_pieces_cut or 0
    return {
        "total_fabric_cost": round(total_cost, 2),
        "total_meters_issued": round(total_meters, 2),
        "wastage_meters": wastage_meters,
        "cost_per_meter_avg": round(total_cost / total_meters, 4) if total_meters else None,
        "cost_per_piece": round(total_cost / pieces, 4) if pieces else None,
        "fabric_utilization_pct": float(lot.fabric_utilization_pct) if lot.fabric_utilization_pct else None,
    }


def get_accessory_cost(db: Session, tenant, lot: Lot) -> dict:
    """Accessory/thread/button/label costs come from the style's BOM
    (module 9) x actual pieces produced -- BOM is the recipe, this just
    multiplies it by real output instead of the BOM's planned quantity."""
    bom = (
        db.query(BOM)
        .filter(BOM.style_id == lot.style_id, BOM.is_deleted == False, BOM.status == DocumentStatus.APPROVED)
        .order_by(BOM.version.desc())
        .first()
    )
    if not bom:
        return {"total_accessory_cost": 0.0, "note": "No approved BOM found for this style -- accessory cost not computed, not fabricated as zero-meaning-none."}

    pieces = lot.total_pieces_cut or 0
    items = db.query(BOMItem).filter(BOMItem.bom_id == bom.id).all()
    breakdown = []
    total = 0.0
    for item in items:
        qty_per_piece = float(item.quantity) * (1 + float(item.wastage_percent or 0) / 100)
        item_cost = qty_per_piece * float(item.unit_cost or 0) * pieces
        total += item_cost
        breakdown.append({
            "product_id": item.product_id, "unit_cost": float(item.unit_cost or 0),
            "total_cost": round(item_cost, 2),
        })
    return {
        "total_accessory_cost": round(total, 2),
        "bom_id": bom.id, "bom_number": bom.bom_number,
        "breakdown": breakdown,
        "cost_per_piece": round(total / pieces, 4) if pieces else None,
    }


# ==================== LABOR COST (reuses payroll, never recomputed) ====================


def get_labor_cost(db: Session, tenant, lot: Lot) -> dict:
    """Reuses payroll_service.get_bundle_eligibility_ratios() -- the
    exact same quality-adjustment payroll applies -- rather than a second
    implementation of "how much of this output counts". Splits into
    confirmed (employee's payroll for that period is APPROVED) vs
    provisional (payroll still draft/pending), per "use only Approved
    Payroll" -- but provisional is still surfaced, not hidden, since a
    lot's cost sheet shouldn't silently show $0 labor just because
    payroll hasn't run yet."""
    from app.models.models import SalarySlip, DocumentStatus

    bundles = db.query(Bundle).filter(Bundle.lot_id == lot.id, Bundle.is_deleted == False).all()
    bundle_ids = [b.id for b in bundles]
    if not bundle_ids:
        return {"confirmed_labor_cost": 0.0, "provisional_labor_cost": 0.0, "scan_count": 0}

    scans = db.query(BundleScanEvent).filter(BundleScanEvent.bundle_id.in_(bundle_ids)).all()
    if not scans:
        return {"confirmed_labor_cost": 0.0, "provisional_labor_cost": 0.0, "scan_count": 0}

    ratios = payroll_service.get_bundle_eligibility_ratios(db, tenant, bundle_ids)

    confirmed, provisional = 0.0, 0.0
    for scan in scans:
        eligible_amount = float(scan.amount_earned or 0) * ratios.get(scan.bundle_id, 1.0)
        slip = (
            db.query(SalarySlip)
            .filter(
                SalarySlip.employee_id == scan.employee_id,
                SalarySlip.month == scan.scanned_at.month, SalarySlip.year == scan.scanned_at.year,
                SalarySlip.status == DocumentStatus.APPROVED,
            )
            .first()
        )
        if slip:
            confirmed += eligible_amount
        else:
            provisional += eligible_amount

    return {
        "confirmed_labor_cost": round(confirmed, 2),
        "provisional_labor_cost": round(provisional, 2),
        "scan_count": len(scans),
        "note": "provisional_labor_cost reflects scans whose employee payroll period isn't APPROVED yet -- "
                "included for visibility, not counted as final cost.",
    }


# ==================== MACHINE COST ====================


def get_machine_cost(db: Session, tenant, lot: Lot, date_from: date, date_to: date) -> dict:
    """Reuses machine_service.get_capacity_metrics() for hours (module
    10) and MachineMaintenanceLog.cost directly -- no separate hour or
    maintenance tracking here."""
    bundles = db.query(Bundle).filter(Bundle.lot_id == lot.id, Bundle.is_deleted == False).all()
    bundle_ids = [b.id for b in bundles]
    machine_ids = list({
        row[0] for row in db.query(BundleScanEvent.machine_id)
        .filter(BundleScanEvent.bundle_id.in_(bundle_ids), BundleScanEvent.machine_id.isnot(None))
        .distinct().all()
    }) if bundle_ids else []

    policy = get_policy(db, tenant)
    total = 0.0
    breakdown = []
    for machine_id in machine_ids:
        machine = db.query(Machine).filter(Machine.id == machine_id).first()
        if not machine:
            continue
        metrics = machine_service.get_capacity_metrics(db, tenant, machine, date_from, date_to)
        hourly_rate = float(machine.hourly_operating_cost or 0)
        depreciation_rate = float(machine.depreciation_per_hour or policy.default_machine_depreciation_per_hour or 0)
        running_hours = metrics["running_hours_approx"]

        maintenance_cost = (
            db.query(sa_func.coalesce(sa_func.sum(MachineMaintenanceLog.cost), 0))
            .filter(
                MachineMaintenanceLog.machine_id == machine_id,
                sa_func.date(MachineMaintenanceLog.performed_at) >= date_from,
                sa_func.date(MachineMaintenanceLog.performed_at) <= date_to,
            )
            .scalar()
        )
        machine_total = (running_hours * hourly_rate) + (running_hours * depreciation_rate) + float(maintenance_cost or 0)
        total += machine_total
        breakdown.append({
            "machine_id": machine_id, "running_hours_approx": running_hours,
            "operating_cost": round(running_hours * hourly_rate, 2),
            "depreciation": round(running_hours * depreciation_rate, 2),
            "maintenance_cost": float(maintenance_cost or 0),
            "total": round(machine_total, 2),
        })

    return {
        "total_machine_cost": round(total, 2), "breakdown": breakdown,
        "note": "running hours are the same approximation documented in machine_service "
                "(hourly scan-activity buckets, not continuous state tracking).",
    }


# ==================== QUALITY COST ====================


def get_quality_cost(db: Session, tenant, lot: Lot) -> dict:
    """Reuses QualityCheck/BundleReject/BundleRework directly (module 11)
    -- no separate quality-cost ledger."""
    policy = get_policy(db, tenant)
    bundles = db.query(Bundle).filter(Bundle.lot_id == lot.id, Bundle.is_deleted == False).all()
    bundle_ids = [b.id for b in bundles]

    inspection_count = (
        db.query(sa_func.count(QualityCheck.id))
        .filter(QualityCheck.reference_type == "bundle", QualityCheck.reference_id.in_(bundle_ids))
        .scalar()
    ) if bundle_ids else 0
    inspection_cost = float(inspection_count or 0) * float(policy.inspection_cost_per_check)

    reject_qty = (
        db.query(sa_func.coalesce(sa_func.sum(BundleReject.reject_quantity), 0))
        .filter(BundleReject.bundle_id.in_(bundle_ids))
        .scalar()
    ) if bundle_ids else 0

    fabric = get_fabric_cost(db, tenant, lot)
    accessory = get_accessory_cost(db, tenant, lot)
    cost_per_piece_material = (fabric.get("cost_per_piece") or 0) + (accessory.get("cost_per_piece") or 0)
    reject_cost = float(reject_qty or 0) * cost_per_piece_material

    rework_count = (
        db.query(sa_func.count(BundleRework.id))
        .filter(BundleRework.original_bundle_id.in_(bundle_ids))
        .scalar()
    ) if bundle_ids else 0

    return {
        "inspection_count": inspection_count, "inspection_cost": round(inspection_cost, 2),
        "reject_quantity": float(reject_qty or 0), "reject_cost": round(reject_cost, 2),
        "rework_count": rework_count,
        "total_quality_cost": round(inspection_cost + reject_cost, 2),
        "note": "rework_count is informational here -- its labor cost is already captured "
                "(or excluded, per policy) inside get_labor_cost via the same eligibility ratio.",
    }


# ==================== PACKING COST (reuses stock_service, no new table) ====================


def record_packing_consumption(
    db: Session, tenant, lot: Lot, actor_user_id: int, product_id: int,
    quantity: float, warehouse_id: int, unit_cost: Optional[float] = None,
) -> dict:
    """Records packing material consumption as a normal StockLedger OUT
    movement via the existing stock_service -- not a new packing-cost
    table. reference_type='packing_cost' is what get_packing_cost()
    below filters on."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise CostingError("Packing material product not found")
    cost = unit_cost if unit_cost is not None else float(product.cost_price or 0)

    entry = stock_service.post_stock_movement(
        db, tenant, product_id=product_id, warehouse_id=warehouse_id,
        movement_type=StockMovementType.OUT, quantity=quantity, unit_cost=cost,
        reference_type="packing_cost", reference_id=lot.id,
        reference_number=lot.lot_number, remarks="Packing material consumption",
    )
    return {"stock_ledger_id": entry.id, "total_cost": float(entry.total_cost)}


def get_packing_cost(db: Session, tenant, lot: Lot) -> dict:
    from app.models.models import StockLedger

    total = (
        db.query(sa_func.coalesce(sa_func.sum(StockLedger.total_cost), 0))
        .filter(StockLedger.reference_type == "packing_cost", StockLedger.reference_id == lot.id)
        .scalar()
    )
    return {"total_packing_cost": float(total or 0)}


# ==================== OVERHEAD ====================


def get_overhead_allocation(db: Session, tenant, lot: Lot, date_from: date, date_to: date) -> dict:
    policy = get_policy(db, tenant)
    overheads = (
        tenant.apply(
            db.query(OverheadCost).filter(
                OverheadCost.period_start <= date_to, OverheadCost.period_end >= date_from,
                OverheadCost.is_deleted == False,
            ),
            OverheadCost,
        ).all()
    )
    total_overhead_period = sum(float(o.amount) for o in overheads)
    if total_overhead_period == 0:
        return {"allocated_overhead": 0.0, "basis": policy.overhead_allocation_basis, "total_factory_overhead_in_period": 0.0}

    if policy.overhead_allocation_basis == "per_piece":
        from app.models.models import ProductionOrder
        total_pieces_period = (
            db.query(sa_func.coalesce(sa_func.sum(Lot.total_pieces_cut), 0))
            .filter(Lot.factory_id == tenant.factory_id, Lot.cutting_date >= date_from, Lot.cutting_date <= date_to)
            .scalar()
        )
        allocated = (
            (float(lot.total_pieces_cut or 0) / float(total_pieces_period)) * total_overhead_period
            if total_pieces_period else 0.0
        )
    else:
        # per_bundle / per_hour fall back to an even split across lots in
        # the period until those bases have their own aggregate query --
        # documented simplification, not silently wrong math.
        lot_count_in_period = (
            db.query(sa_func.count(Lot.id))
            .filter(Lot.factory_id == tenant.factory_id, Lot.cutting_date >= date_from, Lot.cutting_date <= date_to)
            .scalar()
        ) or 1
        allocated = total_overhead_period / lot_count_in_period

    return {
        "allocated_overhead": round(allocated, 2),
        "basis": policy.overhead_allocation_basis,
        "total_factory_overhead_in_period": round(total_overhead_period, 2),
    }


# ==================== COST SHEET (the orchestrator) ====================


def generate_cost_sheet(db: Session, tenant, lot: Lot) -> dict:
    """THE single cost-sheet calculation. Nothing else in this codebase
    assembles a manufacturing cost total."""
    date_from = lot.cutting_date or date.today()
    date_to = date.today()

    fabric = get_fabric_cost(db, tenant, lot)
    accessory = get_accessory_cost(db, tenant, lot)
    labor = get_labor_cost(db, tenant, lot)
    machine = get_machine_cost(db, tenant, lot, date_from, date_to)
    quality = get_quality_cost(db, tenant, lot)
    packing = get_packing_cost(db, tenant, lot)
    overhead = get_overhead_allocation(db, tenant, lot, date_from, date_to)

    material_cost = fabric["total_fabric_cost"] + accessory["total_accessory_cost"]
    labor_cost = labor["confirmed_labor_cost"]  # only CONFIRMED (approved payroll) counts toward total cost
    total_cost = (
        material_cost + labor_cost + machine["total_machine_cost"]
        + quality["total_quality_cost"] + packing["total_packing_cost"] + overhead["allocated_overhead"]
    )
    pieces = lot.total_pieces_cut or 0

    return {
        "lot_id": lot.id, "lot_number": lot.lot_number,
        "material_cost": round(material_cost, 2),
        "fabric_cost": fabric, "accessory_cost": accessory,
        "labor_cost": labor, "machine_cost": machine,
        "quality_cost": quality, "packing_cost": packing, "overhead": overhead,
        "total_cost": round(total_cost, 2),
        "cost_per_piece": round(total_cost / pieces, 4) if pieces else None,
        "pieces_produced": pieces,
        "note": "total_cost uses only CONFIRMED labor cost (approved payroll); "
                f"provisional_labor_cost of {labor['provisional_labor_cost']} is excluded from "
                "total_cost until payroll for those scans is approved.",
    }


# ==================== PROFIT ANALYSIS ====================


def get_profit_analysis(db: Session, tenant, lot: Lot) -> dict:
    """selling_price is read from Product.selling_price as a proxy --
    Sales & Dispatch (module 13) doesn't exist yet, so there's no real
    realized sale price to use. Explicit about this rather than treating
    the catalog price as an actual transaction."""
    cost_sheet = generate_cost_sheet(db, tenant, lot)
    product = db.query(Product).filter(Product.id == lot.production_order.product_id).first() if lot.production_order else None
    selling_price_per_piece = float(product.selling_price) if product and product.selling_price else None

    if selling_price_per_piece is None or not cost_sheet["cost_per_piece"]:
        return {
            "lot_id": lot.id, "gross_profit": None, "gross_margin_pct": None,
            "note": "No selling price or cost-per-piece available -- profit not fabricated as zero.",
        }

    pieces = cost_sheet["pieces_produced"]
    revenue = selling_price_per_piece * pieces
    manufacturing_cost = cost_sheet["total_cost"]
    gross_profit = revenue - manufacturing_cost
    gross_margin_pct = round((gross_profit / revenue) * 100, 2) if revenue else None

    return {
        "lot_id": lot.id, "revenue_at_catalog_price": round(revenue, 2),
        "manufacturing_cost": manufacturing_cost, "gross_profit": round(gross_profit, 2),
        "gross_margin_pct": gross_margin_pct,
        "note": "Uses Product.selling_price (catalog), not a realized sale price -- "
                "Sales & Dispatch (module 13) will supply actual transaction prices later.",
    }


# ==================== VARIANCE ANALYSIS ====================


def get_variance_analysis(db: Session, tenant, lot: Lot) -> dict:
    """Planned cost = BOM.total_cost (module 9's stored planned figure) +
    style-standard labor via OperationRate, scaled to actual output.
    Actual = this module's own cost sheet. No separate 'planned cost'
    table was created -- BOM already IS the planned cost record."""
    bom = (
        db.query(BOM)
        .filter(BOM.style_id == lot.style_id, BOM.is_deleted == False, BOM.status == DocumentStatus.APPROVED)
        .order_by(BOM.version.desc())
        .first()
    )
    actual = generate_cost_sheet(db, tenant, lot)
    pieces = lot.total_pieces_cut or 0

    if not bom or not bom.total_cost:
        return {
            "lot_id": lot.id, "material_variance": None,
            "note": "No approved BOM with a planned total_cost for this style -- variance not computed.",
        }

    planned_material_per_piece = float(bom.total_cost) / float(bom.quantity) if bom.quantity else 0
    planned_material_total = planned_material_per_piece * pieces
    material_variance = actual["material_cost"] - planned_material_total

    return {
        "lot_id": lot.id,
        "planned_material_cost": round(planned_material_total, 2),
        "actual_material_cost": actual["material_cost"],
        "material_variance": round(material_variance, 2),
        "note": "Only material variance is computed against BOM (the one planned-cost source "
                "that exists). Labor/machine/overhead variance would need standard-rate baselines "
                "that don't exist in this schema yet -- not fabricated.",
    }


# ==================== DASHBOARD & REPORTS ====================


def get_costing_dashboard(db: Session, tenant) -> dict:
    today = date.today()
    todays_lots = (
        db.query(Lot)
        .filter(Lot.factory_id == tenant.factory_id, Lot.cutting_date == today, Lot.is_deleted == False)
        .all()
    )
    todays_material, todays_labor, todays_machine, todays_profit = 0.0, 0.0, 0.0, 0.0
    for lot in todays_lots:
        sheet = generate_cost_sheet(db, tenant, lot)
        todays_material += sheet["material_cost"]
        todays_labor += sheet["labor_cost"]["confirmed_labor_cost"]
        todays_machine += sheet["machine_cost"]["total_machine_cost"]
        profit = get_profit_analysis(db, tenant, lot)
        todays_profit += profit.get("gross_profit") or 0

    return {
        "date": today,
        "todays_production_cost": round(todays_material + todays_labor + todays_machine, 2),
        "todays_material_cost": round(todays_material, 2),
        "todays_labor_cost": round(todays_labor, 2),
        "todays_machine_cost": round(todays_machine, 2),
        "todays_profit": round(todays_profit, 2),
        "lots_costed_today": len(todays_lots),
    }


def report_lot_cost(db: Session, tenant, lot_id: int) -> dict:
    lot = db.query(Lot).filter(Lot.id == lot_id).first()
    if not lot:
        raise CostingError("Lot not found")
    return generate_cost_sheet(db, tenant, lot)


def report_operation_cost(db: Session, tenant, date_from: date, date_to: date) -> list:
    """Reuses BundleScanEvent grouped by operation -- the same source
    machine_service's machine reports and payroll's cost-analysis report
    both read from."""
    rows = (
        db.query(BundleScanEvent.operation_id, sa_func.sum(BundleScanEvent.amount_earned))
        .filter(
            sa_func.date(BundleScanEvent.scanned_at) >= date_from,
            sa_func.date(BundleScanEvent.scanned_at) <= date_to,
        )
        .group_by(BundleScanEvent.operation_id)
        .all()
    )
    return [{"operation_id": r[0], "total_cost": float(r[1] or 0)} for r in rows]


def report_employee_cost(db: Session, tenant, date_from: date, date_to: date) -> list:
    rows = (
        db.query(BundleScanEvent.employee_id, sa_func.sum(BundleScanEvent.amount_earned))
        .filter(
            sa_func.date(BundleScanEvent.scanned_at) >= date_from,
            sa_func.date(BundleScanEvent.scanned_at) <= date_to,
        )
        .group_by(BundleScanEvent.employee_id)
        .order_by(sa_func.sum(BundleScanEvent.amount_earned).desc())
        .all()
    )
    return [{"employee_id": r[0], "total_cost": float(r[1] or 0)} for r in rows]
