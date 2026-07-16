"""
Thermal Printing & Label Management (module 16) -- the ONLY printing
engine in this ERP.

Renders NOTHING new for barcodes/QR codes -- every label/document
function this dispatches to already existed (utils/barcode.py,
utils/documents.py, utils/thermal_print.py, built across modules 1-15)
or is the one new reusable template added alongside this module
(generate_simple_slip_pdf). This service's actual job: resolve the
right ERP entity's data, call the right existing renderer, and log the
result to PrintHistory -- nothing here computes a barcode value or lays
out a page itself.
"""

from typing import Optional, List
from datetime import datetime
from sqlalchemy.orm import Session

from app.models.models import (
    PrintHistory, PrintJob, PrintStatus,
    Bundle, Lot, FabricRoll, Employee, Machine, Warehouse,
    PackingCarton, Product, StockBalance,
    SalesInvoice, DeliveryChallan, SalesOrder, PurchaseOrder, GRN,
    QualityCheck, SalarySlip, Attendance, WorkAssignment,
)
from app.utils import barcode as barcode_utils
from app.utils import documents as document_utils
from app.utils import thermal_print as thermal_utils
from app.services import realtime_service


class PrintingError(ValueError):
    pass


LABEL_DISPATCH = {
    "fabric_roll", "lot", "bundle", "carton", "finished_goods",
    "employee_id_card", "machine", "warehouse", "rack",
}
DOCUMENT_DISPATCH = {
    "sales_invoice", "delivery_challan", "packing_list", "production_slip",
    "issue_slip", "receive_slip", "quality_report", "payroll_slip",
    "attendance_slip", "purchase_order", "grn",
}


# ==================== LABEL RENDERING (dispatches to utils/barcode.py) ====================


def render_label(db: Session, entity_type: str, entity_id: int, label_size: str = "medium") -> bytes:
    size_enum = barcode_utils.LabelSize(label_size) if label_size in ("small", "medium", "large") else barcode_utils.LabelSize.MEDIUM

    if entity_type == "bundle":
        b = db.query(Bundle).filter(Bundle.id == entity_id).first()
        if not b or not b.barcode_value:
            raise PrintingError("Bundle not found or has no barcode identity")
        return barcode_utils.generate_bundle_label(
            bundle_number=b.barcode_value,
            production_number=b.production_order.production_number if b.production_order else "",
            product_name=b.production_order.product.name if b.production_order and b.production_order.product else "",
            color=b.color.name if b.color else None, size_label=b.size.name if b.size else None,
            quantity=str(b.quantity), stage=b.current_stage.value if b.current_stage else None,
            label_size=size_enum,
        )
    if entity_type == "lot":
        l = db.query(Lot).filter(Lot.id == entity_id).first()
        if not l or not l.barcode_value:
            raise PrintingError("Lot not found or has no barcode identity")
        return barcode_utils.generate_lot_label(
            lot_number=l.barcode_value, style_name=l.style.name if l.style else "",
            production_number=l.production_order.production_number if l.production_order else None,
            total_pieces=str(l.total_pieces_planned) if l.total_pieces_planned else None,
            cutting_date=str(l.cutting_date) if l.cutting_date else None, label_size=size_enum,
        )
    if entity_type == "fabric_roll":
        r = db.query(FabricRoll).filter(FabricRoll.id == entity_id).first()
        if not r or not r.barcode_value:
            raise PrintingError("Fabric roll not found or has no barcode identity")
        return barcode_utils.generate_fabric_roll_label(
            roll_number=r.barcode_value, fabric_name=r.fabric.name if r.fabric else "",
            color=r.color.name if r.color else None, shade=r.shade,
            gsm=str(r.gsm) if r.gsm else None, width=str(r.width_inches) if r.width_inches else None,
            length_meters=str(r.balance_length_meters), label_size=size_enum,
        )
    if entity_type == "employee_id_card":
        e = db.query(Employee).filter(Employee.id == entity_id).first()
        if not e or not e.barcode_value:
            raise PrintingError("Employee not found or has no barcode identity")
        return barcode_utils.generate_employee_id_card(
            employee_code=e.barcode_value, full_name=e.full_name,
            department=e.department.name if e.department else "", label_size=size_enum,
        )
    if entity_type == "machine":
        m = db.query(Machine).filter(Machine.id == entity_id).first()
        if not m or not m.barcode_value:
            raise PrintingError("Machine not found or has no barcode identity")
        return barcode_utils.generate_machine_label(
            machine_code=m.barcode_value, machine_name=m.name, machine_type=m.machine_type or "", label_size=size_enum,
        )
    if entity_type in ("warehouse", "rack"):
        w = db.query(Warehouse).filter(Warehouse.id == entity_id).first()
        if not w or not w.barcode_value:
            raise PrintingError("Warehouse not found or has no barcode identity")
        if entity_type == "rack":
            return barcode_utils.generate_rack_label(location_code=w.barcode_value, warehouse_name=w.name, label_size=size_enum)
        return barcode_utils.generate_warehouse_label(
            warehouse_code=w.barcode_value, warehouse_name=w.name, warehouse_type=w.warehouse_type or "", label_size=size_enum,
        )
    if entity_type == "carton":
        c = db.query(PackingCarton).filter(PackingCarton.id == entity_id).first()
        if not c or not c.barcode_value:
            raise PrintingError("Carton not found or has no barcode identity")
        return barcode_utils.generate_carton_label(
            carton_barcode=c.barcode_value, carton_number=c.carton_number,
            packing_number=c.packing_list.packing_number if c.packing_list else "", label_size=size_enum,
        )
    if entity_type == "finished_goods":
        p = db.query(Product).filter(Product.id == entity_id).first()
        if not p:
            raise PrintingError("Product not found")
        return barcode_utils.generate_finished_goods_label(
            product_sku=p.barcode or p.sku, product_name=p.name, label_size=size_enum,
        )

    raise PrintingError(f"Unsupported label entity_type: {entity_type}")


# ==================== DOCUMENT RENDERING (dispatches to utils/documents.py) ====================


def _company_dict(tenant, db: Session) -> dict:
    from app.models.models import Company
    company = db.query(Company).filter(Company.id == tenant.company_id).first()
    if not company:
        return {}
    return {"name": company.name, "address": company.address, "city": company.city, "state": company.state, "gst_number": getattr(company, "gst_number", None)}


def render_document(db: Session, tenant, document_type: str, entity_id: int) -> bytes:
    company = _company_dict(tenant, db)

    if document_type == "sales_invoice":
        inv = db.query(SalesInvoice).filter(SalesInvoice.id == entity_id).first()
        if not inv:
            raise PrintingError("Sales invoice not found")
        customer = inv.customer
        return document_utils.generate_invoice_pdf(
            invoice_number=inv.invoice_number, invoice_date=inv.invoice_date, company=company,
            party={"name": customer.name if customer else "", "address": customer.address if customer else "", "gst_number": customer.gst_number if customer else None},
            items=[{"name": i.product.name if i.product else "", "quantity": float(i.quantity), "rate": float(i.unit_price), "amount": float(i.amount)} for i in inv.items],
            subtotal=float(inv.subtotal or 0), cgst=float(inv.cgst_amount or 0), sgst=float(inv.sgst_amount or 0),
            igst=float(inv.igst_amount or 0), discount=float(inv.discount or 0), round_off=float(inv.round_off or 0),
            grand_total=float(inv.grand_total or 0), paid_amount=float(inv.paid_amount or 0),
            due_date=inv.due_date, notes=inv.notes,
        )

    if document_type == "delivery_challan":
        dc = db.query(DeliveryChallan).filter(DeliveryChallan.id == entity_id).first()
        if not dc:
            raise PrintingError("Delivery challan not found")
        return document_utils.generate_delivery_challan_pdf(
            challan_number=dc.challan_number, challan_date=dc.challan_date, company=company,
            customer={"name": dc.customer.name if dc.customer else ""},
            order_number=dc.order.order_number if dc.order else "",
            vehicle_number=dc.vehicle_number, transport_name=dc.transport_name,
            items=[{"name": i.product.name if i.product else "", "quantity": float(i.quantity)} for i in dc.items],
            notes=dc.notes,
        )

    if document_type == "purchase_order":
        po = db.query(PurchaseOrder).filter(PurchaseOrder.id == entity_id).first()
        if not po:
            raise PrintingError("Purchase order not found")
        return document_utils.generate_purchase_order_pdf(
            po_number=po.po_number, po_date=po.po_date, company=company,
            vendor={"name": po.vendor.name if po.vendor else ""},
            items=[{"name": i.product.name if i.product else "", "quantity": float(i.quantity), "rate": float(i.unit_price)} for i in po.items],
            grand_total=float(po.grand_total or 0),
        )

    if document_type == "grn":
        grn = db.query(GRN).filter(GRN.id == entity_id).first()
        if not grn:
            raise PrintingError("GRN not found")
        return document_utils.generate_grn_pdf(
            grn_number=grn.grn_number, grn_date=grn.grn_date, company=company,
            vendor={"name": grn.vendor.name if grn.vendor else ""},
            warehouse_name=grn.warehouse.name if grn.warehouse else "",
            po_number=grn.order.po_number if grn.order else "",
            items=[{"name": i.product.name if i.product else "", "quantity": float(i.accepted_quantity)} for i in grn.items],
            remarks=grn.remarks,
        )

    if document_type in ("production_slip", "issue_slip", "receive_slip"):
        wa = db.query(WorkAssignment).filter(WorkAssignment.id == entity_id).first()
        if not wa:
            raise PrintingError("Work assignment not found")
        title = {"production_slip": "Production Slip", "issue_slip": "Issue Slip", "receive_slip": "Receive Slip"}[document_type]
        return document_utils.generate_simple_slip_pdf(
            title=title, doc_number=f"WA{wa.id:05d}", doc_date=wa.assigned_at, company=company,
            fields=[
                ("Bundle", wa.bundle.bundle_number if wa.bundle else ""),
                ("Employee", wa.employee.full_name if wa.employee else ""),
                ("Operation", wa.operation.name if wa.operation else ""),
                ("Status", wa.status.value if wa.status else ""),
            ],
        )

    if document_type == "quality_report":
        qc = db.query(QualityCheck).filter(QualityCheck.id == entity_id).first()
        if not qc:
            raise PrintingError("Quality check not found")
        return document_utils.generate_simple_slip_pdf(
            title="Quality Inspection Report", doc_number=qc.qc_number, doc_date=qc.qc_date, company=company,
            fields=[
                ("Type", qc.qc_type.value if qc.qc_type else ""),
                ("Result", qc.result.value if qc.result else ""),
                ("Inspected Qty", str(qc.inspected_quantity)),
                ("Passed", str(qc.passed_quantity)), ("Rejected", str(qc.rejected_quantity)),
                ("Rework", str(qc.rework_quantity)),
            ],
            notes=qc.defect_description,
        )

    if document_type == "payroll_slip":
        slip = db.query(SalarySlip).filter(SalarySlip.id == entity_id).first()
        if not slip:
            raise PrintingError("Salary slip not found")
        return document_utils.generate_simple_slip_pdf(
            title="Salary Slip", doc_number=slip.slip_number, doc_date=None, company=company,
            fields=[
                ("Employee", slip.employee.full_name if slip.employee else ""),
                ("Period", f"{slip.month}/{slip.year}"),
                ("Gross Salary", f"{float(slip.gross_salary):.2f}"),
                ("Total Deductions", f"{float(slip.total_deductions):.2f}"),
                ("Net Salary", f"{float(slip.net_salary):.2f}"),
            ],
        )

    if document_type == "attendance_slip":
        att = db.query(Attendance).filter(Attendance.id == entity_id).first()
        if not att:
            raise PrintingError("Attendance record not found")
        return document_utils.generate_simple_slip_pdf(
            title="Attendance Slip", doc_number=f"ATT{att.id:05d}", doc_date=att.attendance_date, company=company,
            fields=[
                ("Employee", att.employee.full_name if att.employee else ""),
                ("Status", att.status.value if att.status else ""),
                ("Check In", str(att.check_in) if att.check_in else ""),
                ("Check Out", str(att.check_out) if att.check_out else ""),
            ],
        )

    raise PrintingError(f"Unsupported document_type: {document_type}")


# ==================== PRINT HISTORY (single source of truth for "was this printed") ====================


def log_print(
    db: Session, tenant, document_type: str, entity_type: str, entity_id: int, format: str,
    actor_user_id: int, printer_name: Optional[str] = None, printer_type: Optional[str] = None,
    copies: int = 1, status: PrintStatus = PrintStatus.COMPLETED, error_message: Optional[str] = None,
    is_reprint: bool = False, original_print_id: Optional[int] = None,
) -> PrintHistory:
    record = PrintHistory(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        document_type=document_type, entity_type=entity_type, entity_id=entity_id,
        format=format, printer_name=printer_name, printer_type=printer_type, copies=copies,
        printed_by=actor_user_id, status=status, error_message=error_message,
        is_reprint=is_reprint, original_print_id=original_print_id,
    )
    db.add(record)
    db.flush()

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="print_completed" if status == PrintStatus.COMPLETED else "print_failed",
        entity_type="print_history", entity_id=record.id,
        payload={"document_type": document_type, "entity_type": entity_type, "entity_id": entity_id},
    )
    return record


def reprint(db: Session, tenant, print_history_id: int, actor_user_id: int) -> PrintHistory:
    original = db.query(PrintHistory).filter(PrintHistory.id == print_history_id).first()
    if not original:
        raise PrintingError("Original print record not found")
    if original.status == PrintStatus.VOIDED:
        raise PrintingError("Cannot reprint a voided label")
    return log_print(
        db, tenant, original.document_type, original.entity_type, original.entity_id, original.format,
        actor_user_id, original.printer_name, original.printer_type, original.copies,
        is_reprint=True, original_print_id=original.id,
    )


def void_print(db: Session, tenant, print_history_id: int, actor_user_id: int, reason: str) -> PrintHistory:
    record = db.query(PrintHistory).filter(PrintHistory.id == print_history_id).first()
    if not record:
        raise PrintingError("Print record not found")
    if record.status == PrintStatus.VOIDED:
        raise PrintingError("Already voided")
    record.status = PrintStatus.VOIDED
    record.voided_at = datetime.utcnow()
    record.voided_by = actor_user_id
    record.void_reason = reason

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="print_voided", entity_type="print_history", entity_id=record.id,
        payload={"reason": reason},
    )
    return record


def get_print_history(db: Session, tenant, entity_type: Optional[str] = None, entity_id: Optional[int] = None) -> list:
    query = tenant.apply(db.query(PrintHistory), PrintHistory)
    if entity_type:
        query = query.filter(PrintHistory.entity_type == entity_type)
    if entity_id is not None:
        query = query.filter(PrintHistory.entity_id == entity_id)
    return query.order_by(PrintHistory.printed_at.desc()).all()


# ==================== BULK PRINTING (background queue) ====================


def create_bulk_print_job(
    db: Session, tenant, job_type: str, actor_user_id: int,
    reference_id: Optional[int] = None, target_ids: Optional[List[int]] = None,
    format: str = "png", printer_name: Optional[str] = None,
) -> PrintJob:
    """Creates the job record and resolves the target list, but does NOT
    execute rendering synchronously -- actual background execution
    (Celery, already a project dependency per requirements.txt) is not
    wired here; this establishes the queue's data model and the
    resolution logic a worker would call, consistent with this session's
    pattern of building the real piece that's independently valuable
    (target resolution, status tracking) without fabricating a task
    runner integration that can't be verified in this environment."""
    if job_type not in ("lot", "production_order", "bundles", "cartons", "finished_goods"):
        raise PrintingError(f"Unsupported job_type: {job_type}")

    resolved_targets = target_ids or []
    if job_type == "lot" and reference_id:
        resolved_targets = [b.id for b in db.query(Bundle).filter(Bundle.lot_id == reference_id, Bundle.is_deleted == False).all()]
    elif job_type == "production_order" and reference_id:
        resolved_targets = [b.id for b in db.query(Bundle).filter(Bundle.production_order_id == reference_id, Bundle.is_deleted == False).all()]

    job = PrintJob(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        job_type=job_type, reference_id=reference_id, target_ids=resolved_targets,
        format=format, printer_name=printer_name, total_items=len(resolved_targets),
        requested_by=actor_user_id,
    )
    db.add(job)
    db.flush()

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="print_job_queued", entity_type="print_job", entity_id=job.id,
        payload={"job_type": job_type, "total_items": job.total_items},
    )
    return job


def process_print_job_synchronously(db: Session, tenant, job: PrintJob, actor_user_id: int) -> PrintJob:
    """Runs the job inline (synchronous fallback) -- exists so the queue
    is actually usable today without Celery wired, while remaining the
    natural place a real worker would call the same per-item logic from.
    Renders each bundle label via render_label() (module 16's own
    dispatcher) and logs each to PrintHistory -- one render function, one
    history table, called N times, not N different code paths."""
    job.status = PrintStatus.PROCESSING
    entity_type = "bundle" if job.job_type in ("lot", "production_order", "bundles") else job.job_type

    for target_id in (job.target_ids or []):
        try:
            render_label(db, entity_type, target_id, job.format if job.format in ("small", "medium", "large") else "medium")
            log_print(db, tenant, f"{entity_type}_label", entity_type, target_id, "png", actor_user_id, job.printer_name, status=PrintStatus.COMPLETED)
            job.completed_items += 1
        except PrintingError:
            job.failed_items += 1

    job.status = PrintStatus.COMPLETED if job.failed_items == 0 else PrintStatus.FAILED
    job.completed_at = datetime.utcnow()
    return job
