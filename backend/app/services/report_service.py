"""
Reports, Analytics & MIS (module 14) -- the single reporting facade.

Two categories of function live here, clearly separated:

1. FACADE functions that call an existing service's report function
   directly -- these do NOT recompute anything; they exist so the
   frontend has one place to call for every report, without this module
   reimplementing quality_service/machine_service/payroll_service/
   costing_service/sales_service's own calculations. Marked "delegates to"
   in each docstring.

2. NEW aggregations for genuine gaps: inventory ABC/slow-moving/dead-stock/
   FIFO analysis (nothing else computes these), production register/WIP/
   finished-goods views, payroll department/operation breakdowns, sales
   trend/state-wise/GST, cost period-aggregates, and Executive MIS
   (combines KPIs across every domain -- itself calls the other services'
   functions rather than re-deriving their numbers).

Every function takes `db, tenant` plus report-specific filters -- no
report result is cached or stored; "no duplicate reporting tables" is
enforced by never writing report output back to the database.
"""

from typing import Optional, List
from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func

from app.models.models import (
    Lot, LotStatus, Bundle, BundleStatus, WIPLedger, ProductionOrder,
    StockBalance, StockLedger, StockMovementType, FabricRoll, FabricRollMovement, LotFabricIssue,
    Product, Warehouse, Attendance, PayrollBonus, PayrollDeduction, SalarySlip,
    MachineDowntime, Customer, SalesInvoice, SalesOrder, Quotation, DeliveryChallan,
    OverheadCost, SavedFilter,
)
from app.services import quality_service, machine_service, payroll_service, costing_service, sales_service


# ==================== FACADE (delegates only, no recomputation) ====================

def quality_defect_trend(db, tenant, date_from, date_to):
    """Delegates to quality_service.report_defect_trend()."""
    return quality_service.report_defect_trend(db, tenant, date_from, date_to)


def quality_pareto(db, tenant, date_from, date_to):
    return quality_service.report_pareto(db, tenant, date_from, date_to)


def quality_heatmap(db, tenant, date_from, date_to):
    return quality_service.report_quality_heatmap(db, tenant, date_from, date_to)


def quality_capa(db, tenant, date_from, date_to):
    return quality_service.report_capa(db, tenant, date_from, date_to)


def quality_kpis(db, tenant, date_from, date_to):
    """Delegates to quality_service.compute_kpis() -- covers First Pass
    Yield, Defect PPM, Reject %, inspector/machine quality scores."""
    return quality_service.compute_kpis(db, tenant, date_from, date_to)


def machine_utilization(db, tenant, date_from, date_to):
    return machine_service.report_utilization(db, tenant, date_from, date_to)


def machine_efficiency(db, tenant, date_from, date_to):
    return machine_service.report_efficiency(db, tenant, date_from, date_to)


def machine_downtime(db, tenant, date_from, date_to):
    return machine_service.report_downtime(db, tenant, date_from, date_to)


def machine_maintenance(db, tenant, date_from, date_to):
    return machine_service.report_maintenance(db, tenant, date_from, date_to)


def machine_operator_performance(db, tenant, date_from, date_to):
    return machine_service.report_operator(db, tenant, date_from, date_to)


def payroll_register(db, tenant, month, year):
    return payroll_service.report_payroll_register(db, tenant, month, year)


def payroll_statutory(db, tenant, month, year):
    """PF/ESI/TDS -- delegates to payroll_service.report_statutory()."""
    return payroll_service.report_statutory(db, tenant, month, year)


def payroll_cost_analysis(db, tenant, month, year):
    return payroll_service.report_cost_analysis(db, tenant, month, year)


def cost_lot_report(db, tenant, lot_id):
    """Manufacturing Cost Sheet for one lot -- delegates to
    costing_service.generate_cost_sheet() via report_lot_cost()."""
    return costing_service.report_lot_cost(db, tenant, lot_id)


def cost_operation_report(db, tenant, date_from, date_to):
    return costing_service.report_operation_cost(db, tenant, date_from, date_to)


def cost_employee_report(db, tenant, date_from, date_to):
    return costing_service.report_employee_cost(db, tenant, date_from, date_to)


def sales_customer_wise(db, tenant, date_from, date_to):
    return sales_service.report_customer_wise_sales(db, tenant, date_from, date_to)


def sales_product_wise(db, tenant, date_from, date_to):
    return sales_service.report_product_wise_sales(db, tenant, date_from, date_to)


def sales_customer_ledger(db, tenant, customer_id):
    """Delegates to sales_service.get_customer_ledger() -- computed from
    SalesInvoice/Payment/CreditDebitNote, never a stored ledger table."""
    return sales_service.get_customer_ledger(db, tenant, customer_id)


# ==================== NEW: MANUFACTURING/PRODUCTION ====================


def production_register(db, tenant, date_from: date, date_to: date, status_filter: Optional[str] = None) -> list:
    query = (
        tenant.apply(db.query(Lot), Lot)
        .filter(Lot.cutting_date >= date_from, Lot.cutting_date <= date_to, Lot.is_deleted == False)
    )
    if status_filter:
        try:
            query = query.filter(Lot.status == LotStatus(status_filter))
        except ValueError:
            pass
    rows = query.all()
    return [
        {
            "lot_id": l.id, "lot_number": l.lot_number, "style_id": l.style_id,
            "status": l.status.value if l.status else None,
            "planned_pieces": l.total_pieces_planned, "cut_pieces": l.total_pieces_cut,
        }
        for l in rows
    ]


def production_pending_completed_rejected(db, tenant, date_from: date, date_to: date) -> dict:
    """Reuses Lot/Bundle status directly rather than a separate
    "production status" tracking table."""
    lots = (
        tenant.apply(db.query(Lot), Lot)
        .filter(Lot.cutting_date >= date_from, Lot.cutting_date <= date_to, Lot.is_deleted == False)
        .all()
    )
    pending = sum(1 for l in lots if l.status not in (LotStatus.CLOSED, LotStatus.CANCELLED))
    completed = sum(1 for l in lots if l.status == LotStatus.CLOSED)

    from app.models.models import BundleReject
    rejected_qty = (
        db.query(sa_func.coalesce(sa_func.sum(BundleReject.reject_quantity), 0))
        .join(Bundle, Bundle.id == BundleReject.bundle_id)
        .filter(Bundle.lot_id.in_([l.id for l in lots]))
        .scalar()
    ) if lots else 0

    return {
        "total_lots": len(lots), "pending_lots": pending, "completed_lots": completed,
        "rejected_quantity": float(rejected_qty or 0),
    }


def wip_report(db, tenant, stage: Optional[str] = None) -> list:
    """Direct read of WIPLedger (module 6) -- the live WIP board this
    project already maintains, not a recomputed snapshot."""
    query = db.query(WIPLedger)
    query = tenant.apply(query, WIPLedger)
    if stage:
        query = query.filter(WIPLedger.current_stage == stage)
    rows = query.all()
    return [
        {
            "bundle_id": w.bundle_id, "current_stage": w.current_stage,
            "current_holder_employee_id": w.current_holder_employee_id,
            "current_machine_id": w.current_machine_id, "last_event_at": w.last_event_at,
        }
        for w in rows
    ]


def finished_goods_report(db, tenant) -> list:
    """StockBalance filtered to Product.product_type == 'finished' --
    reuses the existing inventory balance table, no new FG-specific storage."""
    rows = (
        tenant.apply(db.query(StockBalance), StockBalance)
        .join(Product, Product.id == StockBalance.product_id)
        .filter(Product.product_type == "finished", StockBalance.quantity > 0)
        .all()
    )
    return [
        {"product_id": r.product_id, "warehouse_id": r.warehouse_id, "quantity": float(r.quantity), "avg_cost": float(r.avg_cost or 0)}
        for r in rows
    ]


# ==================== NEW: FABRIC & INVENTORY ANALYSIS ====================


def fabric_roll_register(db, tenant, date_from: Optional[date] = None, date_to: Optional[date] = None) -> list:
    query = tenant.apply(db.query(FabricRoll), FabricRoll).filter(FabricRoll.is_deleted == False)
    if date_from:
        query = query.filter(sa_func.date(FabricRoll.created_at) >= date_from)
    if date_to:
        query = query.filter(sa_func.date(FabricRoll.created_at) <= date_to)
    rows = query.all()
    return [
        {
            "roll_number": r.roll_number, "fabric_id": r.fabric_id,
            "roll_length_meters": float(r.roll_length_meters), "balance_length_meters": float(r.balance_length_meters),
            "status": r.status.value if r.status else None,
        }
        for r in rows
    ]


def fabric_consumption_report(db, tenant, date_from: date, date_to: date) -> list:
    """Genuine architectural note, not a style choice: the OLDER
    /reports/fabric-consumption endpoint (pre-existing, in
    backend/app/api/v1/endpoints/reports.py) filters
    StockLedger.reference_type == "production", a convention that
    predates the Fabric Roll/Lot module (module 3/4) built this session.
    fabric_roll_service.issue_from_roll() tags its StockLedger entries
    reference_type="fabric_roll_issue" (or the caller's own reference_type,
    e.g. "lot"), NOT "production" -- so the old report now silently
    returns incomplete/empty results for fabric issued through the
    current Lot/FabricRoll workflow. This function reads LotFabricIssue
    directly instead, which IS how fabric consumption is actually
    recorded today. Flagged here and in module 14's docs; the old
    endpoint was deliberately left unmodified per "don't touch prior
    modules without cause" but this is exactly that cause, documented
    rather than silently patched deep in a file this pass didn't own."""
    rows = (
        db.query(LotFabricIssue.lot_id, sa_func.sum(LotFabricIssue.issued_length_meters))
        .filter(sa_func.date(LotFabricIssue.issued_at) >= date_from, sa_func.date(LotFabricIssue.issued_at) <= date_to)
        .group_by(LotFabricIssue.lot_id)
        .all()
    )
    return [{"lot_id": r[0], "total_meters_consumed": float(r[1] or 0)} for r in rows]


def fabric_wastage_report(db, tenant, date_from: date, date_to: date) -> list:
    """Reuses Lot.fabric_wastage_meters (set at cutting completion,
    module 4) -- not a separate wastage-tracking table."""
    rows = (
        tenant.apply(db.query(Lot), Lot)
        .filter(Lot.cutting_date >= date_from, Lot.cutting_date <= date_to, Lot.fabric_wastage_meters > 0)
        .all()
    )
    return [
        {"lot_id": l.id, "lot_number": l.lot_number, "wastage_meters": float(l.fabric_wastage_meters or 0),
         "utilization_pct": float(l.fabric_utilization_pct) if l.fabric_utilization_pct else None}
        for l in rows
    ]


def stock_valuation_report(db, tenant, warehouse_id: Optional[int] = None) -> dict:
    query = tenant.apply(db.query(StockBalance), StockBalance).filter(StockBalance.quantity > 0)
    if warehouse_id:
        query = query.filter(StockBalance.warehouse_id == warehouse_id)
    rows = query.all()
    total_value = sum(float(r.quantity) * float(r.avg_cost or 0) for r in rows)
    return {
        "total_stock_value": round(total_value, 2),
        "line_count": len(rows),
        "by_product": [
            {"product_id": r.product_id, "quantity": float(r.quantity), "value": round(float(r.quantity) * float(r.avg_cost or 0), 2)}
            for r in rows
        ],
    }


def warehouse_report(db, tenant) -> list:
    warehouses = tenant.apply(db.query(Warehouse), Warehouse).filter(Warehouse.is_deleted == False).all()
    results = []
    for w in warehouses:
        balances = db.query(StockBalance).filter(StockBalance.warehouse_id == w.id, StockBalance.quantity > 0).all()
        total_value = sum(float(b.quantity) * float(b.avg_cost or 0) for b in balances)
        results.append({"warehouse_id": w.id, "warehouse_name": w.name, "sku_count": len(balances), "total_value": round(total_value, 2)})
    return results


def abc_analysis(db, tenant, date_from: date, date_to: date) -> list:
    """Classic ABC classification by consumption VALUE (not quantity) --
    genuinely new: nothing else in this schema ranks products this way.
    A = top 70% of cumulative value, B = next 20%, C = remaining 10%."""
    rows = (
        db.query(StockLedger.product_id, sa_func.sum(StockLedger.total_cost))
        .filter(
            StockLedger.movement_type == StockMovementType.OUT,
            sa_func.date(StockLedger.created_at) >= date_from,
            sa_func.date(StockLedger.created_at) <= date_to,
        )
        .group_by(StockLedger.product_id)
        .order_by(sa_func.sum(StockLedger.total_cost).desc())
        .all()
    )
    total_value = sum(float(r[1] or 0) for r in rows) or 1
    cumulative = 0.0
    results = []
    for product_id, value in rows:
        cumulative += float(value or 0)
        cumulative_pct = (cumulative / total_value) * 100
        category = "A" if cumulative_pct <= 70 else "B" if cumulative_pct <= 90 else "C"
        results.append({"product_id": product_id, "consumption_value": float(value or 0), "cumulative_pct": round(cumulative_pct, 2), "category": category})
    return results


def slow_moving_inventory(db, tenant, days_threshold: int = 60) -> list:
    """Stock with quantity > 0 but no movement in `days_threshold` days --
    reuses StockBalance.last_movement_date (already tracked by
    stock_service on every movement), no new tracking needed."""
    cutoff = datetime.utcnow() - timedelta(days=days_threshold)
    rows = (
        tenant.apply(db.query(StockBalance), StockBalance)
        .filter(StockBalance.quantity > 0)
        .filter((StockBalance.last_movement_date.is_(None)) | (StockBalance.last_movement_date < cutoff))
        .all()
    )
    return [
        {"product_id": r.product_id, "warehouse_id": r.warehouse_id, "quantity": float(r.quantity), "last_movement_date": r.last_movement_date}
        for r in rows
    ]


def dead_stock_report(db, tenant, days_threshold: int = 180) -> list:
    """Same mechanism as slow-moving, longer threshold -- deliberately
    NOT a separate calculation, just a stricter cutoff on the same query."""
    return slow_moving_inventory(db, tenant, days_threshold)


def fifo_analysis(db, tenant, product_id: int, warehouse_id: int) -> list:
    """Which specific stock-in movements (oldest first) would be consumed
    to fulfill upcoming demand -- reuses StockLedger's existing
    quantity/unit_cost per movement, doesn't introduce a parallel lot-
    costing mechanism (that's what FabricRoll/LotFabricIssue already do
    for fabric specifically; this is the generic-product version)."""
    rows = (
        db.query(StockLedger)
        .filter(StockLedger.product_id == product_id, StockLedger.warehouse_id == warehouse_id, StockLedger.movement_type == StockMovementType.IN)
        .order_by(StockLedger.created_at.asc())
        .all()
    )
    return [{"stock_ledger_id": r.id, "quantity": float(r.quantity), "unit_cost": float(r.unit_cost or 0), "date": r.created_at} for r in rows]


# ==================== NEW: PAYROLL BREAKDOWNS ====================


def payroll_department_report(db, tenant, month: int, year: int) -> list:
    from app.models.models import Employee
    rows = (
        db.query(Employee.department_id, sa_func.sum(SalarySlip.net_salary))
        .join(SalarySlip, SalarySlip.employee_id == Employee.id)
        .filter(SalarySlip.month == month, SalarySlip.year == year)
        .group_by(Employee.department_id)
        .all()
    )
    return [{"department_id": r[0], "total_salary": float(r[1] or 0)} for r in rows]


def payroll_overtime_report(db, tenant, date_from: date, date_to: date) -> list:
    rows = (
        db.query(Attendance.employee_id, sa_func.sum(Attendance.overtime_hours))
        .filter(Attendance.attendance_date >= date_from, Attendance.attendance_date <= date_to, Attendance.overtime_hours > 0)
        .group_by(Attendance.employee_id)
        .all()
    )
    return [{"employee_id": r[0], "total_overtime_hours": float(r[1] or 0)} for r in rows]


def payroll_bonus_report(db, tenant, date_from: date, date_to: date) -> list:
    rows = (
        tenant.apply(db.query(PayrollBonus), PayrollBonus)
        .filter(PayrollBonus.period_start >= date_from, PayrollBonus.period_end <= date_to)
        .all()
    )
    return [{"employee_id": r.employee_id, "bonus_type": r.bonus_type, "amount": float(r.amount)} for r in rows]


def payroll_deduction_report(db, tenant, date_from: date, date_to: date) -> list:
    rows = (
        tenant.apply(db.query(PayrollDeduction), PayrollDeduction)
        .filter(PayrollDeduction.period_start >= date_from, PayrollDeduction.period_end <= date_to)
        .all()
    )
    return [{"employee_id": r.employee_id, "deduction_type": r.deduction_type, "amount": float(r.amount)} for r in rows]


# ==================== NEW: MACHINE ====================


def machine_breakdown_report(db, tenant, date_from: date, date_to: date) -> list:
    rows = (
        db.query(MachineDowntime)
        .filter(
            MachineDowntime.reason == "breakdown",
            sa_func.date(MachineDowntime.started_at) >= date_from,
            sa_func.date(MachineDowntime.started_at) <= date_to,
        )
        .all()
    )
    return [{"machine_id": r.machine_id, "started_at": r.started_at, "duration_minutes": r.duration_minutes} for r in rows]


# ==================== NEW: SALES ====================


def customer_profitability_report(db, tenant, date_from: date, date_to: date) -> list:
    """Combines sales_service's revenue-by-customer with
    costing_service's per-lot manufacturing cost (via get_invoice_profit)
    -- reuses both rather than a third profitability calculation."""
    invoices = (
        tenant.apply(db.query(SalesInvoice), SalesInvoice)
        .filter(SalesInvoice.invoice_date >= date_from, SalesInvoice.invoice_date <= date_to)
        .all()
    )
    by_customer = {}
    for inv in invoices:
        profit = sales_service.get_invoice_profit(db, tenant, inv)
        entry = by_customer.setdefault(inv.customer_id, {"revenue": 0.0, "cost": 0.0, "invoice_count": 0})
        entry["revenue"] += float(inv.grand_total)
        entry["cost"] += profit.get("manufacturing_cost") or 0
        entry["invoice_count"] += 1
    return [
        {"customer_id": cid, "revenue": round(v["revenue"], 2), "cost": round(v["cost"], 2),
         "profit": round(v["revenue"] - v["cost"], 2), "invoice_count": v["invoice_count"]}
        for cid, v in by_customer.items()
    ]


def sales_trend_report(db, tenant, date_from: date, date_to: date) -> list:
    rows = (
        db.query(SalesInvoice.invoice_date, sa_func.sum(SalesInvoice.grand_total))
        .filter(SalesInvoice.invoice_date >= date_from, SalesInvoice.invoice_date <= date_to)
        .group_by(SalesInvoice.invoice_date)
        .order_by(SalesInvoice.invoice_date)
        .all()
    )
    return [{"date": r[0], "revenue": float(r[1] or 0)} for r in rows]


def state_wise_sales(db, tenant, date_from: date, date_to: date) -> list:
    rows = (
        db.query(Customer.state, sa_func.sum(SalesInvoice.grand_total))
        .join(SalesInvoice, SalesInvoice.customer_id == Customer.id)
        .filter(SalesInvoice.invoice_date >= date_from, SalesInvoice.invoice_date <= date_to)
        .group_by(Customer.state)
        .all()
    )
    return [{"state": r[0], "revenue": float(r[1] or 0)} for r in rows]


def gst_report(db, tenant, date_from: date, date_to: date) -> dict:
    """REMOVED as a real duplicate: the pre-existing /reports/gst endpoint
    (module 0 era, backend/app/api/v1/endpoints/reports.py) already
    computes full input-output GST liability (sales GST minus purchase
    GST), which this sales-invoice-only version doesn't. Kept here only
    as a stub raising NotImplementedError so any stray caller fails
    loudly instead of silently getting an incomplete number -- use
    GET /reports/gst instead."""
    raise NotImplementedError(
        "Use GET /reports/gst (backend/app/api/v1/endpoints/reports.py) -- "
        "it computes net GST liability (sales minus purchase), which this "
        "sales-only calculation does not, and duplicating it here would "
        "violate module 14's own 'no duplicate calculations' rule."
    )


# ==================== NEW: COST PERIOD-AGGREGATES ====================


def overhead_analysis_report(db, tenant, date_from: date, date_to: date) -> list:
    rows = (
        tenant.apply(db.query(OverheadCost), OverheadCost)
        .filter(OverheadCost.period_start <= date_to, OverheadCost.period_end >= date_from)
        .all()
    )
    return [{"overhead_type": r.overhead_type, "cost_nature": r.cost_nature, "amount": float(r.amount)} for r in rows]


# ==================== EXECUTIVE MIS (combines every domain's own KPIs) ====================


def executive_mis(db, tenant, date_from: date, date_to: date) -> dict:
    """Daily/Weekly/Monthly/Quarterly/Yearly MIS are all this same
    function called with different date ranges -- there's no separate
    calculation per period length, only a different window. Every figure
    here is a call into an existing service, not a re-derivation."""
    quality = quality_service.compute_kpis(db, tenant, date_from, date_to)
    sales_dashboard = sales_service.get_sales_dashboard(db, tenant)
    payroll_dashboard = payroll_service.get_payroll_dashboard(db, tenant, date_to.month, date_to.year)
    costing_dashboard = costing_service.get_costing_dashboard(db, tenant)
    machine_dashboard = machine_service.get_fleet_dashboard(db, tenant)

    return {
        "period": {"date_from": date_from, "date_to": date_to},
        "factory_kpi": {"machines_running": machine_dashboard["by_status"].get("running", 0), "total_machines": machine_dashboard["total_machines"]},
        "production_kpi": production_pending_completed_rejected(db, tenant, date_from, date_to),
        "sales_kpi": sales_dashboard,
        "quality_kpi": quality,
        "payroll_kpi": payroll_dashboard,
        "cost_kpi": costing_dashboard,
    }


# ==================== UNIFIED DASHBOARD DATASET ====================


def unified_dashboard(db, tenant) -> dict:
    """One call for every "Today's X" widget -- each figure still comes
    from its owning service; this just assembles them for a single
    frontend request instead of five."""
    return {
        "date": date.today(),
        "production": production_pending_completed_rejected(db, tenant, date.today(), date.today()),
        "sales": sales_service.get_sales_dashboard(db, tenant),
        "payroll": payroll_service.get_payroll_dashboard(db, tenant, date.today().month, date.today().year),
        "cost": costing_service.get_costing_dashboard(db, tenant),
        "machine_status": machine_service.get_fleet_dashboard(db, tenant),
        "quality_alerts": quality_service.get_quality_alerts(db, tenant),
        "inventory_alerts": slow_moving_inventory(db, tenant, days_threshold=60)[:20],  # capped, this is an alert feed not a full report
    }


# ==================== SAVED FILTERS ====================


def save_filter(db, user_id: int, report_name: str, filter_name: str, filters: dict) -> SavedFilter:
    saved = SavedFilter(user_id=user_id, report_name=report_name, filter_name=filter_name, filters=filters)
    db.add(saved)
    return saved


def list_saved_filters(db, user_id: int, report_name: Optional[str] = None) -> list:
    query = db.query(SavedFilter).filter(SavedFilter.user_id == user_id)
    if report_name:
        query = query.filter(SavedFilter.report_name == report_name)
    return query.all()
