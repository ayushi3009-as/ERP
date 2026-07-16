"""
Quality Control (module 11).

Two things happen here:
1. Pre-existing logic inline in quality.py's endpoints (QC number
   generation, pass/fail/rework determination) is extracted into this
   service — that file predates the "controllers validate, service
   decides, controller responds" rule and needed to catch up, same as
   every other module has been brought in line with it.
2. New: inspect_bundle() ties a formal QualityCheck record to a specific
   bundle AND delegates the actual state change to bundle_service's
   existing reject_bundle()/start_rework() — this module does NOT
   reimplement bundle rejection/rework, it calls what module 5 already
   built.
"""

from typing import Optional, List
from decimal import Decimal
from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session

from app.models.models import (
    QualityCheck,
    QCType,
    QCResult,
    NumberSeries,
    Bundle,
    DefectCategory,
    QualityStandard,
    MeasurementPoint,
    MeasurementRecord,
    QualityPhoto,
    CAPARecord,
    CAPAStatus,
    ProductionStage,
    WIPLedger,
)
from app.services import barcode_service, realtime_service, bundle_service

GATED_STAGES = (ProductionStage.PACKING, ProductionStage.FINISHED, ProductionStage.DISPATCH)


class QualityCheckError(ValueError):
    pass


def _generate_qc_number(db: Session, tenant) -> str:
    if tenant.factory_id is None:
        raise QualityCheckError("A specific factory must be selected to create a quality check")
    series = (
        db.query(NumberSeries)
        .filter(NumberSeries.module == "quality_check", NumberSeries.factory_id == tenant.factory_id)
        .first()
    )
    if not series:
        series = NumberSeries(
            company_id=tenant.company_id, factory_id=tenant.factory_id,
            series_name="Quality Check", prefix="QC", current_number=0,
            pad_length=5, module="quality_check",
        )
        db.add(series)
        db.flush()
    series.current_number += 1
    number = f"{series.prefix}{str(series.current_number).zfill(series.pad_length)}"
    if series.suffix:
        number = f"{number}{series.suffix}"
    db.flush()
    return number


def _determine_result(passed_qty: float, rejected_qty: float, rework_qty: float) -> Optional[QCResult]:
    if passed_qty > 0 and rejected_qty == 0 and rework_qty == 0:
        return QCResult.PASS
    if rejected_qty > 0:
        return QCResult.FAIL
    if rework_qty > 0:
        return QCResult.REWORK
    return None


def create_quality_check(
    db: Session,
    tenant,
    actor_user_id: int,
    qc_date: date,
    qc_type: str,
    inspected_quantity: float,
    reference_type: Optional[str] = None,
    reference_id: Optional[int] = None,
    product_id: Optional[int] = None,
    production_order_id: Optional[int] = None,
    passed_quantity: float = 0,
    rejected_quantity: float = 0,
    rework_quantity: float = 0,
    inspector_id: Optional[int] = None,
    defect_category_id: Optional[int] = None,
    defect_description: Optional[str] = None,
    remarks: Optional[str] = None,
) -> QualityCheck:
    try:
        qc_type_enum = QCType(qc_type)
    except ValueError:
        raise QualityCheckError(f"Invalid qc_type: {qc_type}")

    if inspected_quantity <= 0:
        raise QualityCheckError("Inspected quantity must be positive")

    total_dispositioned = passed_quantity + rejected_quantity + rework_quantity
    if total_dispositioned > inspected_quantity:
        raise QualityCheckError(
            "passed + rejected + rework quantities cannot exceed inspected quantity"
        )

    result_enum = _determine_result(passed_quantity, rejected_quantity, rework_quantity)
    qc_number = _generate_qc_number(db, tenant)

    qc = QualityCheck(
        company_id=tenant.company_id,
        factory_id=tenant.factory_id,
        qc_number=qc_number,
        qc_date=qc_date,
        qc_type=qc_type_enum,
        reference_type=reference_type,
        reference_id=reference_id,
        defect_category_id=defect_category_id,
        product_id=product_id,
        production_order_id=production_order_id,
        inspected_quantity=Decimal(str(inspected_quantity)),
        passed_quantity=Decimal(str(passed_quantity or 0)),
        rejected_quantity=Decimal(str(rejected_quantity or 0)),
        rework_quantity=Decimal(str(rework_quantity or 0)),
        result=result_enum,
        inspector_id=inspector_id,
        defect_description=defect_description,
        remarks=remarks,
        created_by=actor_user_id,
    )
    db.add(qc)
    db.flush()

    qc.barcode_value, qc.qr_value = barcode_service.generate_for("quality_check", qc.qc_number, qc.id)

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="quality_check_created", entity_type="quality_check", entity_id=qc.id,
        payload={"qc_number": qc.qc_number, "result": result_enum.value if result_enum else None},
    )
    return qc


def inspect_bundle(
    db: Session,
    tenant,
    bundle: Bundle,
    actor_user_id: int,
    qc_type: str,
    passed_quantity: float,
    rejected_quantity: float,
    rework_quantity: float,
    inspector_id: Optional[int] = None,
    defect_category_id: Optional[int] = None,
    defect_description: Optional[str] = None,
    qc_reference_note: Optional[str] = None,
) -> dict:
    """The bundle-specific QC entry point: creates the formal QualityCheck
    record (paper trail + defect categorization) AND, if the result is
    fail/rework, delegates the actual bundle state change to
    bundle_service — never duplicates reject_bundle()/start_rework()."""
    inspected_qty = float(bundle.quantity)
    total = passed_quantity + rejected_quantity + rework_quantity
    if abs(total - inspected_qty) > 0.001:
        raise QualityCheckError(
            f"passed + rejected + rework ({total}) must equal the bundle's quantity ({inspected_qty})"
        )

    qc = create_quality_check(
        db, tenant, actor_user_id,
        qc_date=date.today(), qc_type=qc_type, inspected_quantity=inspected_qty,
        reference_type="bundle", reference_id=bundle.id,
        production_order_id=bundle.production_order_id,
        passed_quantity=passed_quantity, rejected_quantity=rejected_quantity,
        rework_quantity=rework_quantity, inspector_id=inspector_id,
        defect_category_id=defect_category_id, defect_description=defect_description,
    )

    reject_record = None
    rework_record = None

    if rejected_quantity > 0:
        try:
            reject_record = bundle_service.reject_bundle(
                db, tenant, bundle, rejected_quantity,
                reason=defect_description or "Failed quality inspection",
                actor_user_id=actor_user_id, inspector_id=inspector_id,
                qc_reference=qc.qc_number,
            )
            reject_record.defect_category_id = defect_category_id
        except bundle_service.BundleActionError as exc:
            raise QualityCheckError(str(exc))

    if rework_quantity > 0:
        try:
            rework_record = bundle_service.start_rework(
                db, tenant, bundle,
                reason=defect_description or "Requires rework per quality inspection",
                actor_user_id=actor_user_id, employee_id=None,
            )
        except bundle_service.BundleActionError as exc:
            raise QualityCheckError(str(exc))

    if rejected_quantity > 0 or rework_quantity > 0:
        from app.services import payroll_service
        from app.models.models import BundleScanEvent as _BSE
        affected_employee_ids = {
            row[0] for row in db.query(_BSE.employee_id).filter(_BSE.bundle_id == bundle.id).distinct().all()
        }
        for emp_id in affected_employee_ids:
            payroll_service.recalculate_draft_slip(db, tenant, emp_id)

    return {
        "quality_check_id": qc.id,
        "qc_number": qc.qc_number,
        "result": qc.result.value if qc.result else None,
        "bundle_reject_id": reject_record.id if reject_record else None,
        "bundle_rework_id": rework_record.id if rework_record else None,
    }


def get_quality_dashboard(db: Session, tenant, date_from: date, date_to: date) -> dict:
    """Unifies order/incoming/final-level QualityCheck with bundle-level
    BundleReject/BundleRework — reads both, stores neither twice."""
    from sqlalchemy import func as sa_func
    from app.models.models import BundleReject, BundleRework

    qc_query = tenant.apply(
        db.query(QualityCheck).filter(
            QualityCheck.qc_date >= date_from, QualityCheck.qc_date <= date_to,
            QualityCheck.is_deleted == False,
        ),
        QualityCheck,
    )
    checks = qc_query.all()
    total_checks = len(checks)
    passed = sum(1 for c in checks if c.result == QCResult.PASS)
    failed = sum(1 for c in checks if c.result == QCResult.FAIL)
    rework = sum(1 for c in checks if c.result == QCResult.REWORK)

    bundle_reject_count = (
        db.query(sa_func.count(BundleReject.id))
        .filter(
            sa_func.date(BundleReject.created_at) >= date_from,
            sa_func.date(BundleReject.created_at) <= date_to,
        )
        .scalar()
    ) or 0
    bundle_rework_count = (
        db.query(sa_func.count(BundleRework.id))
        .filter(
            sa_func.date(BundleRework.started_at) >= date_from,
            sa_func.date(BundleRework.started_at) <= date_to,
        )
        .scalar()
    ) or 0

    return {
        "date_from": date_from, "date_to": date_to,
        "quality_checks": {
            "total": total_checks, "passed": passed, "failed": failed, "rework": rework,
            "pass_rate_pct": round((passed / total_checks) * 100, 2) if total_checks else None,
        },
        "bundle_level": {
            "rejects": bundle_reject_count, "reworks": bundle_rework_count,
        },
    }


def report_defect_analysis(db: Session, tenant, date_from: date, date_to: date) -> list:
    from sqlalchemy import func as sa_func

    rows = (
        db.query(
            QualityCheck.defect_category_id,
            sa_func.count(QualityCheck.id).label("occurrences"),
            sa_func.sum(QualityCheck.rejected_quantity).label("total_rejected"),
        )
        .filter(
            QualityCheck.qc_date >= date_from, QualityCheck.qc_date <= date_to,
            QualityCheck.result == QCResult.FAIL,
        )
        .group_by(QualityCheck.defect_category_id)
        .all()
    )
    return [
        {
            "defect_category_id": r[0], "occurrences": r[1],
            "total_rejected": float(r[2]) if r[2] else 0,
        }
        for r in rows
    ]


def report_inspector_performance(db: Session, tenant, date_from: date, date_to: date) -> list:
    from sqlalchemy import func as sa_func

    rows = (
        db.query(
            QualityCheck.inspector_id,
            sa_func.count(QualityCheck.id).label("total_inspections"),
            sa_func.sum(QualityCheck.passed_quantity).label("total_passed"),
            sa_func.sum(QualityCheck.rejected_quantity).label("total_rejected"),
        )
        .filter(
            QualityCheck.qc_date >= date_from, QualityCheck.qc_date <= date_to,
            QualityCheck.inspector_id.isnot(None),
        )
        .group_by(QualityCheck.inspector_id)
        .all()
    )
    return [
        {
            "inspector_id": r[0], "total_inspections": r[1],
            "total_passed": float(r[2]) if r[2] else 0,
            "total_rejected": float(r[3]) if r[3] else 0,
        }
        for r in rows
    ]


# ==================== PHASE A: QUALITY STANDARDS MASTER ====================


def create_quality_standard(
    db: Session, tenant, actor_user_id: int, name: str, code: Optional[str] = None,
    product_category_id: Optional[int] = None, product_id: Optional[int] = None,
    design_id: Optional[int] = None, operation_id: Optional[int] = None,
    customer_id: Optional[int] = None, tolerance_notes: Optional[str] = None,
    acceptance_criteria: Optional[str] = None, inspection_checklist: Optional[list] = None,
    sampling_rules: Optional[dict] = None, remarks: Optional[str] = None,
) -> QualityStandard:
    if not name or not name.strip():
        raise QualityCheckError("Quality standard name is required")

    standard = QualityStandard(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        name=name, code=code, product_category_id=product_category_id,
        product_id=product_id, design_id=design_id, operation_id=operation_id,
        customer_id=customer_id, tolerance_notes=tolerance_notes,
        acceptance_criteria=acceptance_criteria, inspection_checklist=inspection_checklist,
        sampling_rules=sampling_rules, remarks=remarks, created_by=actor_user_id,
    )
    db.add(standard)
    return standard


# ==================== PHASE B: MEASUREMENT INSPECTION ====================


def record_measurements(
    db: Session, tenant, quality_check: QualityCheck, measurements: list,
) -> List[MeasurementRecord]:
    """measurements: list of dicts with keys measurement_point_id,
    tolerance_plus, tolerance_minus, specified_value, actual_value."""
    records = []
    for m in measurements:
        point = db.query(MeasurementPoint).filter(MeasurementPoint.id == m["measurement_point_id"]).first()
        if not point:
            raise QualityCheckError(f"Measurement point {m['measurement_point_id']} not found")

        actual = m["actual_value"]
        specified = m.get("specified_value")
        tol_plus = m.get("tolerance_plus")
        tol_minus = m.get("tolerance_minus")
        result = None
        if specified is not None and tol_plus is not None and tol_minus is not None:
            lower = specified - tol_minus
            upper = specified + tol_plus
            result = "pass" if lower <= actual <= upper else "fail"

        record = MeasurementRecord(
            quality_check_id=quality_check.id,
            measurement_point_id=m["measurement_point_id"],
            tolerance_plus=tol_plus, tolerance_minus=tol_minus,
            specified_value=specified, actual_value=actual, result=result,
        )
        db.add(record)
        records.append(record)
    return records


def get_measurement_history(db: Session, tenant, product_id: Optional[int] = None, limit: int = 100) -> list:
    query = (
        db.query(MeasurementRecord)
        .join(QualityCheck, MeasurementRecord.quality_check_id == QualityCheck.id)
    )
    query = tenant.apply(query, QualityCheck)
    if product_id is not None:
        query = query.filter(QualityCheck.product_id == product_id)
    return query.order_by(MeasurementRecord.created_at.desc()).limit(limit).all()


# ==================== PHASE C: PHOTO EVIDENCE ====================


def add_quality_photo(
    db: Session, tenant, quality_check: QualityCheck, photo_type: str, actor_user_id: int,
    photo_url: Optional[str] = None, file_name: Optional[str] = None,
    file_size_bytes: Optional[int] = None, content_type: Optional[str] = None,
) -> QualityPhoto:
    if photo_type not in ("before", "defect", "after_rework"):
        raise QualityCheckError("photo_type must be 'before', 'defect', or 'after_rework'")

    photo = QualityPhoto(
        quality_check_id=quality_check.id, photo_type=photo_type, photo_url=photo_url,
        file_name=file_name, file_size_bytes=file_size_bytes, content_type=content_type,
        uploaded_by=actor_user_id,
    )
    db.add(photo)
    return photo


# ==================== PHASE D: QUALITY GATES ====================


def check_gate_approval(db: Session, tenant, bundle: Bundle, target_stage: ProductionStage) -> None:
    """Raises QualityCheckError if `bundle` isn't cleared to enter
    `target_stage`. Only PACKING/FINISHED/DISPATCH are gated -- earlier
    stages don't require a formal QC pass. Called from scan_service
    BEFORE the stage transition is committed, not as an after-the-fact
    check."""
    if target_stage not in GATED_STAGES:
        return

    latest_qc = (
        tenant.apply(
            db.query(QualityCheck).filter(
                QualityCheck.reference_type == "bundle",
                QualityCheck.reference_id == bundle.id,
            ),
            QualityCheck,
        )
        .order_by(QualityCheck.created_at.desc())
        .first()
    )
    if not latest_qc:
        raise QualityCheckError(
            f"Bundle {bundle.bundle_number} cannot proceed to {target_stage.value} -- "
            f"no quality inspection has been recorded for it yet"
        )
    if latest_qc.result != QCResult.PASS:
        raise QualityCheckError(
            f"Bundle {bundle.bundle_number} cannot proceed to {target_stage.value} -- "
            f"latest inspection ({latest_qc.qc_number}) result was "
            f"'{latest_qc.result.value if latest_qc.result else 'undetermined'}', not 'pass'"
        )


# ==================== PHASE E: ROOT CAUSE ANALYSIS / CAPA ====================


def _generate_capa_number(db: Session, tenant) -> str:
    series = (
        db.query(NumberSeries)
        .filter(NumberSeries.module == "capa", NumberSeries.factory_id == tenant.factory_id)
        .first()
    )
    if not series:
        series = NumberSeries(
            company_id=tenant.company_id, factory_id=tenant.factory_id,
            series_name="CAPA", prefix="CAPA", current_number=0, pad_length=5, module="capa",
        )
        db.add(series)
        db.flush()
    series.current_number += 1
    number = f"{series.prefix}{str(series.current_number).zfill(series.pad_length)}"
    db.flush()
    return number


def create_capa(
    db: Session, tenant, actor_user_id: int, root_cause: str,
    quality_check_id: Optional[int] = None, defect_category_id: Optional[int] = None,
    corrective_action: Optional[str] = None, preventive_action: Optional[str] = None,
    responsible_employee_id: Optional[int] = None, target_date: Optional[date] = None,
) -> CAPARecord:
    if not root_cause or not root_cause.strip():
        raise QualityCheckError("root_cause is required")

    capa = CAPARecord(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        capa_number=_generate_capa_number(db, tenant),
        quality_check_id=quality_check_id, defect_category_id=defect_category_id,
        root_cause=root_cause, corrective_action=corrective_action,
        preventive_action=preventive_action, responsible_employee_id=responsible_employee_id,
        target_date=target_date, status=CAPAStatus.OPEN, created_by=actor_user_id,
    )
    db.add(capa)
    db.flush()

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="capa_created", entity_type="capa", entity_id=capa.id,
        payload={"capa_number": capa.capa_number},
    )
    return capa


def close_capa(db: Session, tenant, capa: CAPARecord, actor_user_id: int, remarks: Optional[str] = None) -> CAPARecord:
    if capa.status == CAPAStatus.CLOSED:
        raise QualityCheckError(f"CAPA {capa.capa_number} is already closed")
    capa.status = CAPAStatus.CLOSED
    capa.closure_date = date.today()
    if remarks:
        capa.remarks = remarks

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="capa_closed", entity_type="capa", entity_id=capa.id,
    )
    return capa


def get_overdue_capas(db: Session, tenant) -> list:
    today = date.today()
    query = (
        db.query(CAPARecord)
        .filter(
            CAPARecord.status.in_([CAPAStatus.OPEN, CAPAStatus.IN_PROGRESS]),
            CAPARecord.target_date.isnot(None),
            CAPARecord.target_date < today,
        )
    )
    query = tenant.apply(query, CAPARecord)
    return query.all()


# ==================== PHASE F: QUALITY KPIs ====================


def compute_kpis(db: Session, tenant, date_from: date, date_to: date) -> dict:
    """Every figure here is computed from QualityCheck/BundleReject/
    BundleRework -- no new storage. Two honest caveats baked into the
    return payload itself:
    - machine_quality_score joins through WIPLedger.current_machine_id,
      which is the bundle's CURRENT machine, not necessarily the machine
      it was on at the moment of the defect (no historical per-scan
      machine-at-defect-time table exists). Treat as directional, not exact.
    - customer_return_pct is None until Sales & Dispatch (module 13)
      exists -- there's no return/complaint data to compute it from yet.
    """
    from sqlalchemy import func as sa_func
    from app.models.models import BundleReject, BundleRework

    checks = (
        tenant.apply(
            db.query(QualityCheck).filter(
                QualityCheck.qc_date >= date_from, QualityCheck.qc_date <= date_to,
                QualityCheck.is_deleted == False,
            ),
            QualityCheck,
        ).all()
    )
    total_inspected = sum(float(c.inspected_quantity) for c in checks) or 0
    total_passed = sum(float(c.passed_quantity) for c in checks) or 0
    total_rejected = sum(float(c.rejected_quantity) for c in checks) or 0
    total_rework = sum(float(c.rework_quantity) for c in checks) or 0

    first_pass_yield = round((total_passed / total_inspected) * 100, 2) if total_inspected else None
    defect_ppm = round((total_rejected / total_inspected) * 1_000_000, 0) if total_inspected else None
    rework_pct = round((total_rework / total_inspected) * 100, 2) if total_inspected else None
    reject_pct = round((total_rejected / total_inspected) * 100, 2) if total_inspected else None

    inspector_rows = (
        db.query(
            QualityCheck.inspector_id,
            sa_func.sum(QualityCheck.passed_quantity).label("passed"),
            sa_func.sum(QualityCheck.inspected_quantity).label("inspected"),
        )
        .filter(QualityCheck.qc_date >= date_from, QualityCheck.qc_date <= date_to, QualityCheck.inspector_id.isnot(None))
        .group_by(QualityCheck.inspector_id)
        .all()
    )
    inspector_scores = [
        {
            "inspector_id": r[0],
            "pass_rate_pct": round((float(r[1]) / float(r[2])) * 100, 2) if r[2] else None,
            "note": "pass rate, not validated 'accuracy' -- no ground-truth re-audit data exists to measure true accuracy against",
        }
        for r in inspector_rows
    ]

    machine_reject_rows = (
        db.query(WIPLedger.current_machine_id, sa_func.count(BundleReject.id))
        .join(Bundle, Bundle.id == BundleReject.bundle_id)
        .join(WIPLedger, WIPLedger.bundle_id == Bundle.id)
        .filter(
            sa_func.date(BundleReject.created_at) >= date_from,
            sa_func.date(BundleReject.created_at) <= date_to,
            WIPLedger.current_machine_id.isnot(None),
        )
        .group_by(WIPLedger.current_machine_id)
        .all()
    )
    machine_scores = [
        {"machine_id": r[0], "reject_count": r[1]}
        for r in machine_reject_rows
    ]

    return {
        "date_from": date_from, "date_to": date_to,
        "first_pass_yield_pct": first_pass_yield,
        "defect_ppm": defect_ppm,
        "rework_pct": rework_pct,
        "reject_pct": reject_pct,
        "customer_return_pct": None,
        "inspector_scores": inspector_scores,
        "machine_quality_scores_approx": machine_scores,
        "factory_quality_score": first_pass_yield,
        "note": "machine_quality_scores_approx uses each bundle's CURRENT machine "
                "(WIPLedger), not the machine at the time of the defect -- no "
                "historical per-scan machine-at-defect table exists yet.",
    }


# ==================== PHASE G: QUALITY ALERTS ====================


def get_quality_alerts(
    db: Session, tenant, reject_rate_threshold_pct: float = 15.0, repeat_defect_threshold: int = 3,
) -> list:
    from sqlalchemy import func as sa_func

    alerts = []
    today = date.today()
    week_ago = today - timedelta(days=7)

    kpis = compute_kpis(db, tenant, week_ago, today)
    if kpis["reject_pct"] is not None and kpis["reject_pct"] > reject_rate_threshold_pct:
        alerts.append({
            "type": "high_reject_rate",
            "detail": f"Reject rate {kpis['reject_pct']}% over the last 7 days exceeds {reject_rate_threshold_pct}%",
        })

    defect_rows = (
        db.query(QualityCheck.defect_category_id, sa_func.count(QualityCheck.id))
        .filter(
            QualityCheck.qc_date >= week_ago, QualityCheck.qc_date <= today,
            QualityCheck.defect_category_id.isnot(None), QualityCheck.result == QCResult.FAIL,
        )
        .group_by(QualityCheck.defect_category_id)
        .having(sa_func.count(QualityCheck.id) >= repeat_defect_threshold)
        .all()
    )
    for defect_category_id, count in defect_rows:
        alerts.append({
            "type": "repeated_defect", "defect_category_id": defect_category_id,
            "detail": f"Defect category {defect_category_id} occurred {count} times in the last 7 days",
        })

    overdue = get_overdue_capas(db, tenant)
    for capa in overdue:
        alerts.append({
            "type": "capa_overdue", "capa_id": capa.id, "capa_number": capa.capa_number,
            "detail": f"CAPA {capa.capa_number} was due {capa.target_date}",
        })

    pending_qc_count = (
        db.query(sa_func.count(Bundle.id))
        .outerjoin(
            QualityCheck,
            (QualityCheck.reference_type == "bundle") & (QualityCheck.reference_id == Bundle.id),
        )
        .filter(Bundle.current_stage.in_(GATED_STAGES), QualityCheck.id.is_(None))
        .scalar()
    ) or 0
    if pending_qc_count > 0:
        alerts.append({
            "type": "pending_qc",
            "detail": f"{pending_qc_count} bundles at a gated stage with no quality check on record",
        })

    return alerts


# ==================== PHASE H: REPORTS ====================


def report_defect_trend(db: Session, tenant, date_from: date, date_to: date) -> list:
    from sqlalchemy import func as sa_func

    rows = (
        db.query(
            sa_func.date(QualityCheck.qc_date).label("day"),
            sa_func.sum(QualityCheck.rejected_quantity).label("rejected"),
        )
        .filter(QualityCheck.qc_date >= date_from, QualityCheck.qc_date <= date_to)
        .group_by(sa_func.date(QualityCheck.qc_date))
        .order_by(sa_func.date(QualityCheck.qc_date))
        .all()
    )
    return [{"date": r[0], "rejected_quantity": float(r[1]) if r[1] else 0} for r in rows]


def report_pareto(db: Session, tenant, date_from: date, date_to: date) -> list:
    """80/20 defect-category breakdown, sorted descending -- reuses
    report_defect_analysis's grouping, adds cumulative % on top rather
    than re-querying."""
    analysis = report_defect_analysis(db, tenant, date_from, date_to)
    analysis.sort(key=lambda x: x["total_rejected"], reverse=True)
    total = sum(a["total_rejected"] for a in analysis) or 1
    cumulative = 0
    for a in analysis:
        cumulative += a["total_rejected"]
        a["cumulative_pct"] = round((cumulative / total) * 100, 2)
    return analysis


def report_quality_heatmap(db: Session, tenant, date_from: date, date_to: date) -> list:
    """Defect concentration by product -- a simple two-axis heatmap
    (product x defect_category), reusing the same QualityCheck data as
    every other report here."""
    from sqlalchemy import func as sa_func

    rows = (
        db.query(
            QualityCheck.product_id, QualityCheck.defect_category_id,
            sa_func.sum(QualityCheck.rejected_quantity).label("total_rejected"),
        )
        .filter(
            QualityCheck.qc_date >= date_from, QualityCheck.qc_date <= date_to,
            QualityCheck.result == QCResult.FAIL,
        )
        .group_by(QualityCheck.product_id, QualityCheck.defect_category_id)
        .all()
    )
    return [
        {"product_id": r[0], "defect_category_id": r[1], "total_rejected": float(r[2]) if r[2] else 0}
        for r in rows
    ]


def report_capa(db: Session, tenant, date_from: date, date_to: date) -> list:
    query = (
        tenant.apply(
            db.query(CAPARecord).filter(
                CAPARecord.created_at >= date_from, CAPARecord.created_at <= date_to,
            ),
            CAPARecord,
        )
    )
    rows = query.all()
    return [
        {
            "capa_number": r.capa_number, "status": r.status.value if r.status else None,
            "root_cause": r.root_cause, "target_date": r.target_date, "closure_date": r.closure_date,
        }
        for r in rows
    ]


def report_customer_complaint(db: Session, tenant, date_from: date, date_to: date) -> dict:
    return {
        "note": "Customer complaint / return data depends on Sales & Dispatch (module 13), "
                "which doesn't exist yet -- this report is a placeholder returning no data "
                "rather than fabricating figures.",
        "items": [],
    }


def report_monthly_summary(db: Session, tenant, year: int, month: int) -> dict:
    from calendar import monthrange

    date_from = date(year, month, 1)
    date_to = date(year, month, monthrange(year, month)[1])
    kpis = compute_kpis(db, tenant, date_from, date_to)
    dashboard = get_quality_dashboard(db, tenant, date_from, date_to)
    return {"period": f"{year}-{month:02d}", "kpis": kpis, "dashboard": dashboard}
