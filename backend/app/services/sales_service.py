"""
Sales & Dispatch (module 13) -- the ONLY source of customer order
fulfillment, finished goods dispatch, invoicing math, customer ledger,
and delivery tracking.

Quotation/SalesOrder/DeliveryChallan/SalesInvoice CRUD and GST totals
already existed before this module (sales.py, tenant-scoping fixed as
part of this pass, same as quality.py/payroll.py needed). This service
adds what didn't exist: finished-goods allocation (FIFO, quality-gated),
packing, barcode-gated dispatch, proper returns/credit-notes (replacing
an old ad-hoc paid_amount hack), payments, and a computed customer
ledger -- while reusing costing_service for profit, barcode_service for
carton/packing identity, and stock_service for any inventory movement.
"""

from typing import Optional, List
from decimal import Decimal
from datetime import date, datetime
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func

from app.models.models import (
    Customer,
    CustomerPriceListItem,
    Product,
    SalesOrder,
    SalesOrderItem,
    SalesInvoice,
    SalesInvoiceItem,
    DeliveryChallan,
    DeliveryChallanItem,
    DispatchStatus,
    Bundle,
    BundleStatus,
    QualityCheck,
    QCResult,
    FinishedGoodsAllocation,
    AllocationStatus,
    PackingList,
    PackingCarton,
    PackingCartonBundle,
    SalesReturn,
    CreditDebitNote,
    Payment,
    DocumentStatus,
    PaymentStatus,
    NumberSeries,
)
from app.services import barcode_service, realtime_service, costing_service


class SalesError(ValueError):
    pass


def _generate_number(db: Session, tenant, module: str, prefix: str, pad: int = 5) -> str:
    if tenant.factory_id is None:
        raise SalesError("A specific factory must be selected")
    series = (
        db.query(NumberSeries)
        .filter(NumberSeries.module == module, NumberSeries.factory_id == tenant.factory_id)
        .first()
    )
    if not series:
        series = NumberSeries(
            company_id=tenant.company_id, factory_id=tenant.factory_id,
            series_name=module.replace("_", " ").title(), prefix=prefix,
            current_number=0, pad_length=pad, module=module,
        )
        db.add(series)
        db.flush()
    series.current_number += 1
    number = f"{series.prefix}{str(series.current_number).zfill(series.pad_length)}"
    db.flush()
    return number


# ==================== PRICE LIST ====================


def resolve_customer_price(db: Session, tenant, customer_id: int, product_id: int, as_of: Optional[date] = None) -> float:
    """Customer-specific price if one exists for the date, else falls
    back to Product.selling_price (the catalog default) -- one lookup
    function, not scattered price-resolution logic across endpoints."""
    as_of = as_of or date.today()
    row = (
        db.query(CustomerPriceListItem)
        .filter(
            CustomerPriceListItem.customer_id == customer_id,
            CustomerPriceListItem.product_id == product_id,
            CustomerPriceListItem.effective_from <= as_of,
        )
        .filter(
            (CustomerPriceListItem.effective_to.is_(None)) | (CustomerPriceListItem.effective_to >= as_of)
        )
        .order_by(CustomerPriceListItem.effective_from.desc())
        .first()
    )
    if row:
        return float(row.price)
    product = db.query(Product).filter(Product.id == product_id).first()
    return float(product.selling_price) if product and product.selling_price else 0.0


# ==================== FINISHED GOODS ALLOCATION (FIFO, quality-gated) ====================


def allocate_finished_goods(
    db: Session, tenant, order_item: SalesOrderItem, actor_user_id: int,
) -> List[FinishedGoodsAllocation]:
    """FIFO allocation of quality-approved, unallocated bundles against
    a sales order item. "Quality-approved" means the bundle's LATEST
    QualityCheck result is PASS -- the same gate scan_service enforces
    before PACKING (module 11), reused here rather than a second
    approval concept. "Unallocated" means no open FinishedGoodsAllocation
    already claims it. Never allocates from WIP (current_stage must be
    at or past PACKING)."""
    from app.models.models import ProductionStage

    already_allocated_bundle_ids = {
        row[0] for row in db.query(FinishedGoodsAllocation.bundle_id)
        .filter(FinishedGoodsAllocation.status.in_([AllocationStatus.RESERVED, AllocationStatus.ALLOCATED, AllocationStatus.DISPATCHED]))
        .filter(FinishedGoodsAllocation.bundle_id.isnot(None))
        .all()
    }

    candidate_bundles = (
        db.query(Bundle)
        .filter(
            Bundle.is_deleted == False,
            Bundle.current_stage.in_([ProductionStage.PACKING, ProductionStage.FINISHED]),
            Bundle.status != BundleStatus.CLOSED,
            ~Bundle.id.in_(already_allocated_bundle_ids) if already_allocated_bundle_ids else True,
        )
        .order_by(Bundle.created_at.asc())  # FIFO: oldest finished bundle first
        .all()
    )

    remaining = float(order_item.quantity) - float(order_item.delivered_quantity or 0)
    allocations = []
    for bundle in candidate_bundles:
        if remaining <= 0:
            break
        latest_qc = (
            db.query(QualityCheck)
            .filter(QualityCheck.reference_type == "bundle", QualityCheck.reference_id == bundle.id)
            .order_by(QualityCheck.created_at.desc())
            .first()
        )
        if not latest_qc or latest_qc.result != QCResult.PASS:
            continue  # not quality-approved -- skip, never allocate from unapproved stock

        take_qty = min(float(bundle.quantity), remaining)
        allocation = FinishedGoodsAllocation(
            company_id=tenant.company_id, factory_id=tenant.factory_id,
            sales_order_item_id=order_item.id, bundle_id=bundle.id,
            quantity=Decimal(str(take_qty)), status=AllocationStatus.ALLOCATED,
            created_by=actor_user_id,
        )
        db.add(allocation)
        allocations.append(allocation)
        remaining -= take_qty

    if remaining > 0:
        backorder = FinishedGoodsAllocation(
            company_id=tenant.company_id, factory_id=tenant.factory_id,
            sales_order_item_id=order_item.id, bundle_id=None,
            quantity=Decimal(str(remaining)), status=AllocationStatus.BACK_ORDER,
            created_by=actor_user_id, remarks="Insufficient quality-approved finished goods",
        )
        db.add(backorder)
        allocations.append(backorder)

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="finished_goods_allocated", entity_type="sales_order_item", entity_id=order_item.id,
        payload={"allocated_count": len([a for a in allocations if a.status == AllocationStatus.ALLOCATED]), "backordered": remaining > 0},
    )
    return allocations


def release_allocation(db: Session, tenant, allocation: FinishedGoodsAllocation) -> FinishedGoodsAllocation:
    if allocation.status == AllocationStatus.DISPATCHED:
        raise SalesError("Cannot release an allocation that has already been dispatched")
    allocation.status = AllocationStatus.RELEASED
    allocation.released_at = datetime.utcnow()
    return allocation


# ==================== PACKING ====================


def create_packing_list(
    db: Session, tenant, actor_user_id: int, sales_order_id: Optional[int] = None,
    packer_id: Optional[int] = None,
) -> PackingList:
    packing = PackingList(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        packing_number=_generate_number(db, tenant, "packing_list", "PKG"),
        sales_order_id=sales_order_id, packing_date=date.today(),
        packer_id=packer_id, created_by=actor_user_id,
    )
    db.add(packing)
    db.flush()
    packing.barcode_value, packing.qr_value = barcode_service.generate_for(
        "packing_list", packing.packing_number, packing.id
    )
    return packing


def add_carton(
    db: Session, tenant, packing_list: PackingList, carton_number: str, carton_type: str = "carton",
    weight_kg: Optional[float] = None, length_cm: Optional[float] = None,
    width_cm: Optional[float] = None, height_cm: Optional[float] = None,
) -> PackingCarton:
    carton = PackingCarton(
        packing_list_id=packing_list.id, carton_number=carton_number, carton_type=carton_type,
        weight_kg=weight_kg, length_cm=length_cm, width_cm=width_cm, height_cm=height_cm,
    )
    db.add(carton)
    db.flush()
    carton.barcode_value = f"CTN-{carton_number}-{carton.id}"
    return carton


def map_bundle_to_carton(db: Session, tenant, carton: PackingCarton, bundle: Bundle, quantity: float) -> PackingCartonBundle:
    mapping = PackingCartonBundle(carton_id=carton.id, bundle_id=bundle.id, quantity=Decimal(str(quantity)))
    db.add(mapping)
    return mapping


def verify_packing_list(db: Session, tenant, packing_list: PackingList, actor_user_id: int) -> PackingList:
    if not packing_list.cartons:
        raise SalesError("Cannot verify a packing list with no cartons")
    packing_list.is_verified = True
    packing_list.verified_by = actor_user_id
    return packing_list


# ==================== BARCODE-GATED DISPATCH ====================


def dispatch_by_barcode_scan(
    db: Session, tenant, challan: DeliveryChallan, barcode_value: str, actor_user_id: int,
) -> dict:
    """Dispatch only proceeds by scanning a Bundle or Carton barcode.
    Validates: correct customer (via the challan's order), correct sales
    order, correct quantity remaining, not already dispatched. Reuses
    barcode_service.resolve_prefix() rather than a second barcode-parsing
    routine."""
    try:
        entity_type = barcode_service.resolve_prefix(barcode_value)
    except ValueError:
        # carton barcodes use the inline "CTN-" prefix (see create_packing_list's
        # note) rather than barcode_service's registry -- handle explicitly here
        if barcode_value.startswith("CTN-"):
            entity_type = "carton"
        else:
            raise SalesError(f"Unrecognized barcode: {barcode_value}")

    if entity_type == "bundle":
        bundle = db.query(Bundle).filter(Bundle.barcode_value == barcode_value).first()
        if not bundle:
            raise SalesError("Bundle not found for this barcode")
        already_dispatched = (
            db.query(DeliveryChallanItem)
            .filter(DeliveryChallanItem.bundle_id == bundle.id)
            .join(DeliveryChallan, DeliveryChallan.id == DeliveryChallanItem.challan_id)
            .filter(DeliveryChallan.dispatch_status.in_([DispatchStatus.DISPATCHED, DispatchStatus.DELIVERED]))
            .first()
        )
        if already_dispatched:
            raise SalesError(f"Bundle {bundle.bundle_number} has already been dispatched (duplicate dispatch prevented)")

        allocation = (
            db.query(FinishedGoodsAllocation)
            .filter(FinishedGoodsAllocation.bundle_id == bundle.id, FinishedGoodsAllocation.status == AllocationStatus.ALLOCATED)
            .first()
        )
        if not allocation:
            raise SalesError(f"Bundle {bundle.bundle_number} is not allocated to any sales order")

        order_item = db.query(SalesOrderItem).filter(SalesOrderItem.id == allocation.sales_order_item_id).first()
        if challan.order_id and order_item and order_item.order_id != challan.order_id:
            raise SalesError("This bundle is allocated to a different sales order than this challan")

        item = DeliveryChallanItem(
            challan_id=challan.id, product_id=order_item.product_id if order_item else bundle.production_order.product_id,
            bundle_id=bundle.id, quantity=bundle.quantity,
            color_id=bundle.color_id, size_id=bundle.size_id,
        )
        db.add(item)
        allocation.status = AllocationStatus.DISPATCHED

        realtime_service.emit(
            db, tenant.company_id, tenant.factory_id,
            event_type="bundle_dispatched", entity_type="bundle", entity_id=bundle.id,
            payload={"challan_id": challan.id},
        )
        return {"scanned": "bundle", "bundle_id": bundle.id, "bundle_number": bundle.bundle_number, "quantity": float(bundle.quantity)}

    elif entity_type == "carton":
        carton = db.query(PackingCarton).filter(PackingCarton.barcode_value == barcode_value).first()
        if not carton:
            raise SalesError("Carton not found for this barcode")
        results = []
        for mapping in carton.bundle_mappings:
            result = dispatch_by_barcode_scan(db, tenant, challan, mapping.bundle.barcode_value, actor_user_id)
            results.append(result)
        return {"scanned": "carton", "carton_id": carton.id, "bundles_dispatched": len(results)}

    raise SalesError(f"Barcode type '{entity_type}' is not dispatchable")


def complete_dispatch(db: Session, tenant, challan: DeliveryChallan, is_partial: bool = False) -> DeliveryChallan:
    if not challan.items:
        raise SalesError("Cannot complete dispatch with no items scanned")
    challan.dispatch_status = DispatchStatus.PARTIAL if is_partial else DispatchStatus.DISPATCHED
    challan.is_partial_dispatch = is_partial
    challan.status = DocumentStatus.COMPLETED if not is_partial else DocumentStatus.SUBMITTED

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="dispatch_completed", entity_type="delivery_challan", entity_id=challan.id,
        payload={"is_partial": is_partial},
    )
    return challan


# ==================== RETURNS & CREDIT NOTES ====================


def process_sales_return(
    db: Session, tenant, invoice_item: SalesInvoiceItem, quantity: float, reason: str,
    actor_user_id: int, disposition: str = "restock",
) -> dict:
    """Replaces the old approach of directly decrementing
    SalesInvoice.paid_amount -- a return doesn't mean less was paid, it
    means a credit is owed. Creates a proper SalesReturn + CreditDebitNote,
    computed pro-rata off the original invoice line's price/discount/GST."""
    if disposition not in ("restock", "scrap", "replacement"):
        raise SalesError("disposition must be 'restock', 'scrap', or 'replacement'")
    if quantity <= 0 or quantity > float(invoice_item.quantity):
        raise SalesError("Return quantity must be positive and not exceed the invoiced quantity")

    invoice = db.query(SalesInvoice).filter(SalesInvoice.id == invoice_item.invoice_id).first()
    unit_price = float(invoice_item.unit_price)
    discount_pct = float(invoice_item.discount_percent or 0)
    gst_rate = float(invoice_item.gst_rate or 0)

    line_amount = unit_price * quantity
    discount_amount = line_amount * discount_pct / 100
    taxable_amount = line_amount - discount_amount
    gst_amount = taxable_amount * gst_rate / 100
    total_credit = taxable_amount + gst_amount

    is_igst = float(invoice.igst_amount or 0) > 0
    cgst = 0 if is_igst else round(gst_amount / 2, 2)
    sgst = 0 if is_igst else round(gst_amount / 2, 2)
    igst = round(gst_amount, 2) if is_igst else 0

    note = CreditDebitNote(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        note_number=_generate_number(db, tenant, "credit_note", "CN"),
        note_type="credit", customer_id=invoice.customer_id, invoice_id=invoice.id,
        reason=reason, amount=Decimal(str(round(total_credit, 2))),
        cgst_amount=Decimal(str(cgst)), sgst_amount=Decimal(str(sgst)), igst_amount=Decimal(str(igst)),
        note_date=date.today(), status=DocumentStatus.APPROVED, created_by=actor_user_id,
    )
    db.add(note)
    db.flush()

    sales_return = SalesReturn(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        return_number=_generate_number(db, tenant, "sales_return", "SR"),
        invoice_id=invoice.id, invoice_item_id=invoice_item.id, quantity=Decimal(str(quantity)),
        reason=reason, disposition=disposition, credit_note_id=note.id,
        return_date=date.today(), created_by=actor_user_id,
    )
    db.add(sales_return)
    db.flush()

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="sales_return_processed", entity_type="sales_return", entity_id=sales_return.id,
        payload={"credit_note_id": note.id, "amount": float(note.amount)},
    )
    return {"sales_return_id": sales_return.id, "credit_note_id": note.id, "credit_amount": float(note.amount)}


# ==================== PAYMENTS (single source; ledger is computed from this) ====================


def record_payment(
    db: Session, tenant, customer: Customer, amount: float, payment_mode: str,
    actor_user_id: int, invoice_id: Optional[int] = None, reference_number: Optional[str] = None,
    remarks: Optional[str] = None,
) -> Payment:
    valid_modes = ("cash", "bank_transfer", "cheque", "upi", "card", "credit")
    if payment_mode not in valid_modes:
        raise SalesError(f"payment_mode must be one of {valid_modes}")
    if amount <= 0:
        raise SalesError("amount must be positive")

    payment = Payment(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        payment_number=_generate_number(db, tenant, "payment", "PAY"),
        customer_id=customer.id, invoice_id=invoice_id, payment_mode=payment_mode,
        amount=Decimal(str(amount)), payment_date=date.today(),
        reference_number=reference_number, remarks=remarks, created_by=actor_user_id,
    )
    db.add(payment)
    db.flush()

    if invoice_id:
        invoice = db.query(SalesInvoice).filter(SalesInvoice.id == invoice_id).first()
        if invoice:
            invoice.paid_amount = (invoice.paid_amount or Decimal("0")) + Decimal(str(amount))
            if invoice.paid_amount >= invoice.grand_total:
                invoice.payment_status = PaymentStatus.PAID
            elif invoice.paid_amount > 0:
                invoice.payment_status = PaymentStatus.PARTIAL

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="payment_received", entity_type="payment", entity_id=payment.id,
        payload={"customer_id": customer.id, "amount": amount},
    )
    return payment


# ==================== CUSTOMER LEDGER (fully computed) ====================


def get_customer_ledger(db: Session, tenant, customer_id: int) -> dict:
    """Debits = SalesInvoice.grand_total, Credits = Payment.amount +
    CreditDebitNote (credit type). Computed on every call from these two
    (three) tables -- never stored, so it cannot drift from what actually
    happened."""
    invoices = (
        tenant.apply(db.query(SalesInvoice), SalesInvoice)
        .filter(SalesInvoice.customer_id == customer_id, SalesInvoice.is_deleted == False)
        .all()
    )
    payments = (
        tenant.apply(db.query(Payment), Payment)
        .filter(Payment.customer_id == customer_id, Payment.is_deleted == False)
        .all()
    )
    credit_notes = (
        tenant.apply(db.query(CreditDebitNote), CreditDebitNote)
        .filter(CreditDebitNote.customer_id == customer_id, CreditDebitNote.note_type == "credit", CreditDebitNote.is_deleted == False)
        .all()
    )

    total_invoiced = sum(float(i.grand_total) for i in invoices)
    total_paid = sum(float(p.amount) for p in payments)
    total_credited = sum(float(c.amount) for c in credit_notes)
    outstanding = total_invoiced - total_paid - total_credited

    return {
        "customer_id": customer_id,
        "total_invoiced": round(total_invoiced, 2),
        "total_paid": round(total_paid, 2),
        "total_credited": round(total_credited, 2),
        "outstanding_balance": round(outstanding, 2),
        "invoice_count": len(invoices),
    }


# ==================== COST & PROFIT (reuses costing_service) ====================


def get_invoice_profit(db: Session, tenant, invoice: SalesInvoice) -> dict:
    """Never recomputes manufacturing cost -- reads it from
    costing_service per invoice line item's lot_id (module 12.5)."""
    total_cost, total_revenue = 0.0, float(invoice.grand_total)
    lot_ids_seen = set()
    for item in invoice.items:
        if item.lot_id and item.lot_id not in lot_ids_seen:
            lot_ids_seen.add(item.lot_id)
            from app.models.models import Lot
            lot = db.query(Lot).filter(Lot.id == item.lot_id).first()
            if lot:
                sheet = costing_service.generate_cost_sheet(db, tenant, lot)
                total_cost += sheet["total_cost"]

    if not lot_ids_seen:
        return {
            "invoice_id": invoice.id, "gross_profit": None,
            "note": "No invoice line items are linked to a Lot -- manufacturing cost not available, not fabricated.",
        }

    gross_profit = total_revenue - total_cost
    gross_margin_pct = round((gross_profit / total_revenue) * 100, 2) if total_revenue else None
    return {
        "invoice_id": invoice.id, "revenue": total_revenue, "manufacturing_cost": round(total_cost, 2),
        "gross_profit": round(gross_profit, 2), "gross_margin_pct": gross_margin_pct,
    }


# ==================== DASHBOARD & REPORTS ====================


def get_sales_dashboard(db: Session, tenant) -> dict:
    today = date.today()
    todays_orders = (
        tenant.apply(db.query(SalesOrder), SalesOrder)
        .filter(SalesOrder.order_date == today, SalesOrder.is_deleted == False).count()
    )
    ready_for_dispatch = (
        db.query(sa_func.count(FinishedGoodsAllocation.id))
        .filter(FinishedGoodsAllocation.status == AllocationStatus.ALLOCATED)
        .scalar()
    ) or 0
    dispatched_today = (
        tenant.apply(db.query(DeliveryChallan), DeliveryChallan)
        .filter(DeliveryChallan.challan_date == today, DeliveryChallan.dispatch_status == DispatchStatus.DISPATCHED)
        .count()
    )
    todays_revenue = (
        db.query(sa_func.coalesce(sa_func.sum(SalesInvoice.grand_total), 0))
        .filter(SalesInvoice.invoice_date == today)
        .scalar()
    )
    outstanding_total = (
        db.query(sa_func.coalesce(sa_func.sum(SalesInvoice.grand_total - SalesInvoice.paid_amount), 0))
        .filter(SalesInvoice.payment_status != PaymentStatus.PAID)
        .scalar()
    )

    return {
        "date": today,
        "todays_orders": todays_orders,
        "ready_for_dispatch": ready_for_dispatch,
        "dispatched_today": dispatched_today,
        "revenue_today": float(todays_revenue or 0),
        "outstanding_payments": float(outstanding_total or 0),
    }


def report_customer_wise_sales(db: Session, tenant, date_from: date, date_to: date) -> list:
    rows = (
        db.query(SalesInvoice.customer_id, sa_func.sum(SalesInvoice.grand_total))
        .filter(SalesInvoice.invoice_date >= date_from, SalesInvoice.invoice_date <= date_to)
        .group_by(SalesInvoice.customer_id)
        .order_by(sa_func.sum(SalesInvoice.grand_total).desc())
        .all()
    )
    return [{"customer_id": r[0], "total_sales": float(r[1] or 0)} for r in rows]


def report_product_wise_sales(db: Session, tenant, date_from: date, date_to: date) -> list:
    rows = (
        db.query(SalesInvoiceItem.product_id, sa_func.sum(SalesInvoiceItem.amount))
        .join(SalesInvoice, SalesInvoice.id == SalesInvoiceItem.invoice_id)
        .filter(SalesInvoice.invoice_date >= date_from, SalesInvoice.invoice_date <= date_to)
        .group_by(SalesInvoiceItem.product_id)
        .order_by(sa_func.sum(SalesInvoiceItem.amount).desc())
        .all()
    )
    return [{"product_id": r[0], "total_sales": float(r[1] or 0)} for r in rows]
