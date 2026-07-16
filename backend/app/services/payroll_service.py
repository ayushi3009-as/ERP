"""
Payroll Engine (module 12) — the ONLY source of salary calculation in
this ERP.

Core principle: BundleScanEvent.amount_earned (module 6) is ALREADY the
per-scan piece-rate calculation, snapshotted at scan time using
rate_service.resolve_rate(). This engine does NOT recompute piece rates
-- it aggregates BundleScanEvent for a period, adjusts for quality
outcomes (reject/rework), and combines that with attendance-based wage
components, bonuses, and deductions into one SalarySlip.

This replaces the old inline calculation that lived in payroll.py's
generate_salary_slips() endpoint, which computed piece-rate pay from
Attendance.pieces_completed x Employee.piece_rate -- a completely
separate, quality-blind calculation path that predates the scan
workflow. That was a real architectural conflict (two ways to compute
the same number, guaranteed to disagree), not a style preference, which
is why it was corrected here rather than left alongside this engine.
"""

from typing import Optional, List
from decimal import Decimal
from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func

from app.models.models import (
    Employee,
    SalaryType,
    SalaryCycle,
    Attendance,
    AttendanceStatus,
    BundleScanEvent,
    Bundle,
    BundleReject,
    BundleRework,
    BundleStatus,
    PayrollPolicy,
    EmployeeAdvance,
    PayrollBonus,
    PayrollDeduction,
    SalarySlip,
    SalarySlipApproval,
    ApprovalStage,
    DocumentStatus,
    NumberSeries,
)
from app.services import realtime_service


class PayrollError(ValueError):
    pass


def _generate_slip_number(db: Session, tenant) -> str:
    series = (
        db.query(NumberSeries)
        .filter(NumberSeries.module == "salary_slip", NumberSeries.factory_id == tenant.factory_id)
        .first()
    )
    if not series:
        series = NumberSeries(
            company_id=tenant.company_id, factory_id=tenant.factory_id,
            series_name="Salary Slip", prefix="SAL", current_number=0,
            pad_length=5, module="salary_slip",
        )
        db.add(series)
        db.flush()
    series.current_number += 1
    number = f"{series.prefix}{str(series.current_number).zfill(series.pad_length)}"
    db.flush()
    return number


def get_policy(db: Session, tenant) -> PayrollPolicy:
    """One policy row per company; created with sensible defaults on
    first access rather than requiring a setup step before payroll works."""
    policy = (
        db.query(PayrollPolicy)
        .filter(PayrollPolicy.company_id == tenant.company_id, PayrollPolicy.is_deleted == False)
        .first()
    )
    if not policy:
        policy = PayrollPolicy(company_id=tenant.company_id)
        db.add(policy)
        db.flush()
    return policy


# ==================== PRODUCTION PAY (quality-adjusted) ====================


def get_bundle_eligibility_ratios(db: Session, tenant, bundle_ids: List[int]) -> dict:
    """Public wrapper — costing_service (module 12.5) needs the exact
    same quality-eligibility ratios payroll uses, to avoid a second,
    possibly-diverging implementation of "how much of this bundle's
    output actually counts"."""
    policy = get_policy(db, tenant)
    return _bundle_eligibility_ratios(db, bundle_ids, policy)


def _bundle_eligibility_ratios(db: Session, bundle_ids: List[int], policy: PayrollPolicy) -> dict:
    """One eligible_ratio per bundle_id: fraction of that bundle's scan
    earnings that should actually be paid, after quality outcomes.

    passed_ratio (full pay) + rework_ratio * (rework_pay_pct/100 if
    rework_payable else 0) + reject_ratio * 0. This is computed once per
    bundle and applied uniformly to every scan against it, since a scan
    event itself doesn't know which specific pieces were later rejected
    -- that assessment happens at the bundle level via QualityCheck/
    BundleReject/BundleRework.
    """
    if not bundle_ids:
        return {}

    bundles = db.query(Bundle).filter(Bundle.id.in_(bundle_ids)).all()
    bundle_qty = {b.id: float(b.quantity) for b in bundles if b.quantity}

    reject_rows = (
        db.query(BundleReject.bundle_id, sa_func.sum(BundleReject.reject_quantity))
        .filter(BundleReject.bundle_id.in_(bundle_ids))
        .group_by(BundleReject.bundle_id)
        .all()
    )
    rejected_qty = {r[0]: float(r[1] or 0) for r in reject_rows}

    rework_rows = (
        db.query(BundleRework.original_bundle_id, sa_func.count(BundleRework.id))
        .filter(BundleRework.original_bundle_id.in_(bundle_ids))
        .group_by(BundleRework.original_bundle_id)
        .all()
    )
    # BundleRework doesn't carry a quantity (it's a whole-bundle rework
    # record per bundle_service.start_rework) -- treat any rework record
    # as "the whole bundle's remaining (non-rejected) quantity went to rework"
    reworked_bundle_ids = {r[0] for r in rework_rows}

    ratios = {}
    for bundle_id, qty in bundle_qty.items():
        if qty <= 0:
            ratios[bundle_id] = 1.0
            continue
        reject_qty = min(rejected_qty.get(bundle_id, 0), qty)
        remaining_after_reject = qty - reject_qty
        reject_ratio = reject_qty / qty

        if bundle_id in reworked_bundle_ids and remaining_after_reject > 0:
            rework_ratio = remaining_after_reject / qty
            passed_ratio = 0.0
        else:
            rework_ratio = 0.0
            passed_ratio = remaining_after_reject / qty

        rework_pay_fraction = (
            float(policy.rework_pay_pct) / 100 if policy.rework_payable else 0.0
        )
        eligible = passed_ratio + (rework_ratio * rework_pay_fraction)
        ratios[bundle_id] = max(0.0, min(1.0, eligible))

    return ratios


def compute_production_pay(
    db: Session, tenant, employee: Employee, period_start: date, period_end: date,
) -> dict:
    """Sums BundleScanEvent.amount_earned for the employee/period,
    adjusted for quality outcomes. Does NOT recompute any rate -- rates
    were already resolved and snapshotted at scan time (module 6)."""
    policy = get_policy(db, tenant)

    scans = (
        db.query(BundleScanEvent)
        .filter(
            BundleScanEvent.employee_id == employee.id,
            sa_func.date(BundleScanEvent.scanned_at) >= period_start,
            sa_func.date(BundleScanEvent.scanned_at) <= period_end,
        )
        .all()
    )
    if not scans:
        return {"gross_production_pay": 0.0, "scan_count": 0, "excluded_for_quality": 0.0}

    bundle_ids = list({s.bundle_id for s in scans})
    ratios = _bundle_eligibility_ratios(db, bundle_ids, policy)

    gross_before_quality = sum(float(s.amount_earned or 0) for s in scans)
    eligible_total = 0.0
    for s in scans:
        ratio = ratios.get(s.bundle_id, 1.0)
        eligible_total += float(s.amount_earned or 0) * ratio

    return {
        "gross_production_pay": round(eligible_total, 2),
        "scan_count": len(scans),
        "excluded_for_quality": round(gross_before_quality - eligible_total, 2),
    }


# ==================== ATTENDANCE ====================


def compute_attendance_summary(
    db: Session, tenant, employee: Employee, period_start: date, period_end: date,
) -> dict:
    records = (
        tenant.apply(
            db.query(Attendance).filter(
                Attendance.employee_id == employee.id,
                Attendance.attendance_date >= period_start,
                Attendance.attendance_date <= period_end,
                Attendance.is_deleted == False,
            ),
            Attendance,
        ).all()
    )
    present = sum(1 for a in records if a.status == AttendanceStatus.PRESENT)
    half_day = sum(1 for a in records if a.status == AttendanceStatus.HALF_DAY)
    leave = sum(1 for a in records if a.status == AttendanceStatus.LEAVE)
    absent = sum(1 for a in records if a.status == AttendanceStatus.ABSENT)
    holiday = sum(1 for a in records if a.status == AttendanceStatus.HOLIDAY)
    total_overtime_hours = sum(float(a.overtime_hours or 0) for a in records)

    return {
        "present_days": present, "half_days": half_day, "leave_days": leave,
        "absent_days": absent, "holiday_days": holiday,
        "total_overtime_hours": total_overtime_hours,
        "effective_days": present + (half_day * 0.5) + holiday,
    }


def compute_overtime_pay(
    db: Session, tenant, employee: Employee, overtime_hours: float, working_days_in_period: int,
) -> float:
    if overtime_hours <= 0 or not employee.basic_salary:
        return 0.0
    policy = get_policy(db, tenant)
    if working_days_in_period <= 0:
        return 0.0
    hourly_rate = float(employee.basic_salary) / (working_days_in_period * 8)
    return round(hourly_rate * overtime_hours * float(policy.overtime_multiplier), 2)


# ==================== BONUSES ====================


def add_bonus(
    db: Session, tenant, employee: Employee, bonus_type: str, amount: float,
    period_start: date, period_end: date, actor_user_id: int, remarks: Optional[str] = None,
) -> PayrollBonus:
    valid_types = ("attendance", "quality", "production", "festival", "performance", "referral")
    if bonus_type not in valid_types:
        raise PayrollError(f"bonus_type must be one of {valid_types}")
    if amount <= 0:
        raise PayrollError("Bonus amount must be positive")

    bonus = PayrollBonus(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        employee_id=employee.id, bonus_type=bonus_type, amount=Decimal(str(amount)),
        period_start=period_start, period_end=period_end, remarks=remarks,
        created_by=actor_user_id,
    )
    db.add(bonus)
    return bonus


def compute_bonus_total(db: Session, tenant, employee: Employee, period_start: date, period_end: date) -> float:
    total = (
        db.query(sa_func.coalesce(sa_func.sum(PayrollBonus.amount), 0))
        .filter(
            PayrollBonus.employee_id == employee.id,
            PayrollBonus.period_start >= period_start,
            PayrollBonus.period_end <= period_end,
        )
        .scalar()
    )
    return float(total or 0)


# ==================== DEDUCTIONS ====================


def compute_statutory_deductions(db: Session, tenant, gross_salary: float, basic_salary: float) -> dict:
    policy = get_policy(db, tenant)
    pf = round(basic_salary * float(policy.pf_rate_pct) / 100, 2) if basic_salary > 0 else 0.0
    esi = (
        round(gross_salary * float(policy.esi_rate_pct) / 100, 2)
        if 0 < gross_salary <= float(policy.esi_wage_ceiling)
        else 0.0
    )
    professional_tax = 0.0
    if policy.professional_tax_slabs:
        for slab in policy.professional_tax_slabs:
            if slab.get("min", 0) <= gross_salary <= slab.get("max", float("inf")):
                professional_tax = float(slab.get("tax", 0))
                break
    return {"pf": pf, "esi": esi, "professional_tax": professional_tax}


def apply_advance_deduction(db: Session, tenant, employee: Employee) -> dict:
    """Deducts the next installment from any active advance/loan and
    reduces its balance -- this is the ONE place balance_remaining
    changes, so it can't drift from what's actually been deducted."""
    active = (
        db.query(EmployeeAdvance)
        .filter(EmployeeAdvance.employee_id == employee.id, EmployeeAdvance.status == "active")
        .all()
    )
    advance_total, loan_total = 0.0, 0.0
    for a in active:
        installment = min(float(a.installment_amount), float(a.balance_remaining))
        if installment <= 0:
            continue
        a.balance_remaining = a.balance_remaining - Decimal(str(installment))
        if a.balance_remaining <= 0:
            a.status = "closed"
        if a.advance_type == "advance":
            advance_total += installment
        else:
            loan_total += installment
    return {"advance_deduction": round(advance_total, 2), "loan_deduction": round(loan_total, 2)}


def compute_adhoc_deductions(db: Session, tenant, employee: Employee, period_start: date, period_end: date) -> float:
    total = (
        db.query(sa_func.coalesce(sa_func.sum(PayrollDeduction.amount), 0))
        .filter(
            PayrollDeduction.employee_id == employee.id,
            PayrollDeduction.period_start >= period_start,
            PayrollDeduction.period_end <= period_end,
        )
        .scalar()
    )
    return float(total or 0)


# ==================== SALARY SLIP GENERATION (the orchestrator) ====================


def _period_bounds(cycle: SalaryCycle, year: int, month: int) -> tuple:
    from calendar import monthrange
    if cycle == SalaryCycle.MONTHLY:
        start = date(year, month, 1)
        end = date(year, month, monthrange(year, month)[1])
    else:
        # weekly/biweekly/custom periods are supplied explicitly by the
        # caller via period_start/period_end in generate_salary_slip;
        # this fallback only applies to the monthly-cycle bulk generator
        start = date(year, month, 1)
        end = date(year, month, monthrange(year, month)[1])
    return start, end


def generate_salary_slip(
    db: Session, tenant, employee: Employee, actor_user_id: int,
    month: int, year: int, period_start: Optional[date] = None, period_end: Optional[date] = None,
    conveyance: float = 0, medical: float = 0,
) -> SalarySlip:
    """THE single calculation path for every salary slip. No other
    function in this codebase creates a SalarySlip."""
    existing = (
        tenant.apply(db.query(SalarySlip), SalarySlip)
        .filter(
            SalarySlip.employee_id == employee.id, SalarySlip.month == month,
            SalarySlip.year == year, SalarySlip.is_deleted == False,
        )
        .first()
    )
    if existing:
        raise PayrollError(
            f"A salary slip already exists for employee {employee.code} for {month}/{year} "
            f"(slip {existing.slip_number}) -- use recalculate instead of generating a duplicate"
        )

    cycle = employee.salary_cycle or SalaryCycle.MONTHLY
    if period_start is None or period_end is None:
        period_start, period_end = _period_bounds(cycle, year, month)

    attendance = compute_attendance_summary(db, tenant, employee, period_start, period_end)
    from calendar import monthrange
    working_days_in_month = monthrange(year, month)[1]

    basic = float(employee.basic_salary or 0)
    hra = float(employee.hra or 0)
    da = float(employee.da or 0)

    # Attendance-proportional basic pay for daily-wage/monthly employees
    # who aren't on piece rate -- monthly staff still get full basic
    # regardless of present-day count in this simplified model (no
    # LOP/loss-of-pay slab logic yet, noted as a known simplification).
    production = {"gross_production_pay": 0.0, "scan_count": 0, "excluded_for_quality": 0.0}
    if employee.salary_type in (SalaryType.PIECE_RATE, SalaryType.OPERATION_RATE, SalaryType.BUNDLE_RATE, SalaryType.MIXED):
        production = compute_production_pay(db, tenant, employee, period_start, period_end)

    overtime_amount = compute_overtime_pay(db, tenant, employee, attendance["total_overtime_hours"], working_days_in_month)
    bonus_total = compute_bonus_total(db, tenant, employee, period_start, period_end)

    piece_rate_amount = production["gross_production_pay"]
    incentive = 0.0  # reserved for future non-piece-rate incentive rules; not fabricated here

    if employee.salary_type in (SalaryType.PIECE_RATE, SalaryType.OPERATION_RATE, SalaryType.BUNDLE_RATE):
        # Pure piece-rate workers: basic/hra/da from the Employee record
        # are treated as zero for gross-up purposes (their pay IS the
        # production pay); if the employee record has legacy basic_salary
        # set, it's ignored here rather than silently double-paying.
        gross = piece_rate_amount + Decimal(str(conveyance)).__float__() + medical + overtime_amount + bonus_total
        basic_for_statutory = piece_rate_amount  # PF base = piece-rate earnings for these workers
    else:
        gross = basic + hra + da + conveyance + medical + overtime_amount + piece_rate_amount + incentive + bonus_total
        basic_for_statutory = basic

    statutory = compute_statutory_deductions(db, tenant, gross, basic_for_statutory)
    advance_loan = apply_advance_deduction(db, tenant, employee)
    adhoc = compute_adhoc_deductions(db, tenant, employee, period_start, period_end)

    total_deductions = (
        statutory["pf"] + statutory["esi"] + statutory["professional_tax"]
        + advance_loan["advance_deduction"] + advance_loan["loan_deduction"] + adhoc
    )
    net = gross - total_deductions

    slip = SalarySlip(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        slip_number=_generate_slip_number(db, tenant),
        employee_id=employee.id, month=month, year=year,
        salary_cycle=cycle, period_start_date=period_start, period_end_date=period_end,
        basic_salary=Decimal(str(basic if employee.salary_type not in (SalaryType.PIECE_RATE, SalaryType.OPERATION_RATE, SalaryType.BUNDLE_RATE) else 0)),
        hra=Decimal(str(hra)), da=Decimal(str(da)),
        conveyance=Decimal(str(conveyance)), medical=Decimal(str(medical)),
        overtime_amount=Decimal(str(overtime_amount)), incentive=Decimal(str(incentive)),
        piece_rate_amount=Decimal(str(piece_rate_amount)), bonus_total=Decimal(str(bonus_total)),
        gross_salary=Decimal(str(round(gross, 2))),
        pf_deduction=Decimal(str(statutory["pf"])), esi_deduction=Decimal(str(statutory["esi"])),
        tds=Decimal("0"),  # TDS requires an income-tax slab engine beyond this module's scope; not fabricated
        professional_tax=Decimal(str(statutory["professional_tax"])),
        advance_deduction=Decimal(str(advance_loan["advance_deduction"])),
        loan_deduction=Decimal(str(advance_loan["loan_deduction"])),
        other_deductions=Decimal(str(adhoc)),
        total_deductions=Decimal(str(round(total_deductions, 2))),
        net_salary=Decimal(str(round(net, 2))),
        working_days=working_days_in_month,
        present_days=attendance["present_days"], absent_days=attendance["absent_days"],
        leave_days=attendance["leave_days"], overtime_days=attendance["total_overtime_hours"],
        status=DocumentStatus.DRAFT,
        created_by=actor_user_id,
    )
    db.add(slip)
    db.flush()

    for stage in (ApprovalStage.EMPLOYEE, ApprovalStage.SUPERVISOR, ApprovalStage.HR, ApprovalStage.ACCOUNTS):
        db.add(SalarySlipApproval(salary_slip_id=slip.id, stage=stage, status="pending"))

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="salary_slip_generated", entity_type="salary_slip", entity_id=slip.id,
        payload={"employee_id": employee.id, "net_salary": float(slip.net_salary)},
    )
    return slip


def recalculate_draft_slip(db: Session, tenant, employee_id: int) -> Optional[SalarySlip]:
    """Called automatically from scan_service (after a scan) and
    quality_service (after a reject/rework) -- if the employee has a
    DRAFT slip for the current period, it's deleted and regenerated
    rather than patched in place, since patching would mean duplicating
    generate_salary_slip's logic a second time. Approved/submitted slips
    are never touched -- recalculation only applies before approval."""
    today = date.today()
    existing = (
        db.query(SalarySlip)
        .filter(
            SalarySlip.employee_id == employee_id,
            SalarySlip.month == today.month, SalarySlip.year == today.year,
            SalarySlip.status == DocumentStatus.DRAFT,
            SalarySlip.is_deleted == False,
        )
        .first()
    )
    if not existing:
        return None

    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        return None

    db.query(SalarySlipApproval).filter(SalarySlipApproval.salary_slip_id == existing.id).delete()
    db.delete(existing)
    db.flush()

    try:
        new_slip = generate_salary_slip(
            db, tenant, employee, actor_user_id=existing.created_by or 0,
            month=today.month, year=today.year,
        )
    except PayrollError:
        return None

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="salary_slip_recalculated", entity_type="salary_slip", entity_id=new_slip.id,
        payload={"employee_id": employee_id},
    )
    return new_slip


def bulk_generate_salary_slips(
    db: Session, tenant, actor_user_id: int, month: int, year: int,
    conveyance: float = 0, medical: float = 0,
) -> List[SalarySlip]:
    employees = (
        tenant.apply(db.query(Employee), Employee)
        .filter(Employee.is_deleted == False, Employee.is_active == True)
        .all()
    )
    created = []
    for emp in employees:
        try:
            slip = generate_salary_slip(
                db, tenant, emp, actor_user_id, month, year,
                conveyance=conveyance, medical=medical,
            )
            created.append(slip)
        except PayrollError:
            continue  # slip already exists for this employee/period -- skip, don't duplicate
    return created


# ==================== APPROVAL CHAIN ====================


APPROVAL_ORDER = [ApprovalStage.EMPLOYEE, ApprovalStage.SUPERVISOR, ApprovalStage.HR, ApprovalStage.ACCOUNTS]


def approve_stage(
    db: Session, tenant, slip: SalarySlip, stage: ApprovalStage, actor_user_id: int,
    remarks: Optional[str] = None,
) -> SalarySlipApproval:
    stage_idx = APPROVAL_ORDER.index(stage)
    if stage_idx > 0:
        prior_stage = APPROVAL_ORDER[stage_idx - 1]
        prior = (
            db.query(SalarySlipApproval)
            .filter(SalarySlipApproval.salary_slip_id == slip.id, SalarySlipApproval.stage == prior_stage)
            .first()
        )
        if not prior or prior.status != "approved":
            raise PayrollError(f"Cannot approve at '{stage.value}' before '{prior_stage.value}' has approved")

    approval = (
        db.query(SalarySlipApproval)
        .filter(SalarySlipApproval.salary_slip_id == slip.id, SalarySlipApproval.stage == stage)
        .first()
    )
    if not approval:
        raise PayrollError(f"No approval record for stage '{stage.value}' on this slip")
    if approval.status == "approved":
        raise PayrollError(f"Stage '{stage.value}' is already approved")

    approval.status = "approved"
    approval.approved_by = actor_user_id
    approval.approved_at = datetime.utcnow()
    approval.remarks = remarks

    if stage == ApprovalStage.ACCOUNTS:
        slip.status = DocumentStatus.APPROVED

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="salary_slip_stage_approved", entity_type="salary_slip", entity_id=slip.id,
        payload={"stage": stage.value},
    )
    return approval


def reject_stage(
    db: Session, tenant, slip: SalarySlip, stage: ApprovalStage, actor_user_id: int, remarks: str,
) -> SalarySlipApproval:
    approval = (
        db.query(SalarySlipApproval)
        .filter(SalarySlipApproval.salary_slip_id == slip.id, SalarySlipApproval.stage == stage)
        .first()
    )
    if not approval:
        raise PayrollError(f"No approval record for stage '{stage.value}' on this slip")
    approval.status = "rejected"
    approval.approved_by = actor_user_id
    approval.approved_at = datetime.utcnow()
    approval.remarks = remarks
    slip.status = DocumentStatus.REJECTED

    realtime_service.emit(
        db, tenant.company_id, tenant.factory_id,
        event_type="salary_slip_stage_rejected", entity_type="salary_slip", entity_id=slip.id,
        payload={"stage": stage.value, "remarks": remarks},
    )
    return approval


# ==================== DASHBOARD & REPORTS ====================


def get_payroll_dashboard(db: Session, tenant, month: int, year: int) -> dict:
    slips = (
        tenant.apply(db.query(SalarySlip), SalarySlip)
        .filter(SalarySlip.month == month, SalarySlip.year == year, SalarySlip.is_deleted == False)
        .all()
    )
    total_payroll = sum(float(s.net_salary) for s in slips)
    pending = sum(1 for s in slips if s.status == DocumentStatus.DRAFT)

    dept_cost = (
        db.query(Employee.department_id, sa_func.sum(SalarySlip.net_salary))
        .join(SalarySlip, SalarySlip.employee_id == Employee.id)
        .filter(SalarySlip.month == month, SalarySlip.year == year)
        .group_by(Employee.department_id)
        .all()
    )

    today = date.today()
    today_scans = (
        db.query(sa_func.coalesce(sa_func.sum(BundleScanEvent.amount_earned), 0))
        .filter(sa_func.date(BundleScanEvent.scanned_at) == today)
        .scalar()
    )

    return {
        "month": month, "year": year,
        "monthly_payroll_total": round(total_payroll, 2),
        "pending_slips": pending,
        "total_slips": len(slips),
        "todays_production_pay_accrued": float(today_scans or 0),
        "department_cost": [{"department_id": r[0], "total": float(r[1] or 0)} for r in dept_cost],
    }


def report_payroll_register(db: Session, tenant, month: int, year: int) -> list:
    slips = (
        tenant.apply(db.query(SalarySlip), SalarySlip)
        .filter(SalarySlip.month == month, SalarySlip.year == year, SalarySlip.is_deleted == False)
        .all()
    )
    return [
        {
            "slip_number": s.slip_number, "employee_id": s.employee_id,
            "gross_salary": float(s.gross_salary), "total_deductions": float(s.total_deductions),
            "net_salary": float(s.net_salary), "status": s.status.value if s.status else None,
        }
        for s in slips
    ]


def report_statutory(db: Session, tenant, month: int, year: int) -> dict:
    slips = (
        tenant.apply(db.query(SalarySlip), SalarySlip)
        .filter(SalarySlip.month == month, SalarySlip.year == year, SalarySlip.is_deleted == False)
        .all()
    )
    return {
        "total_pf": round(sum(float(s.pf_deduction) for s in slips), 2),
        "total_esi": round(sum(float(s.esi_deduction) for s in slips), 2),
        "total_tds": round(sum(float(s.tds) for s in slips), 2),
        "total_professional_tax": round(sum(float(s.professional_tax) for s in slips), 2),
        "employee_count": len(slips),
    }


def report_cost_analysis(db: Session, tenant, month: int, year: int) -> dict:
    """Department/operation/machine cost breakdowns -- operation and
    machine costs reuse BundleScanEvent (the same table module 10's
    machine reports and this module's production pay both read from),
    not a separate cost-tracking table."""
    op_cost = (
        db.query(BundleScanEvent.operation_id, sa_func.sum(BundleScanEvent.amount_earned))
        .filter(
            sa_func.extract("month", BundleScanEvent.scanned_at) == month,
            sa_func.extract("year", BundleScanEvent.scanned_at) == year,
        )
        .group_by(BundleScanEvent.operation_id)
        .all()
    )
    machine_cost = (
        db.query(BundleScanEvent.machine_id, sa_func.sum(BundleScanEvent.amount_earned))
        .filter(
            sa_func.extract("month", BundleScanEvent.scanned_at) == month,
            sa_func.extract("year", BundleScanEvent.scanned_at) == year,
            BundleScanEvent.machine_id.isnot(None),
        )
        .group_by(BundleScanEvent.machine_id)
        .all()
    )
    return {
        "operation_cost": [{"operation_id": r[0], "total": float(r[1] or 0)} for r in op_cost],
        "machine_cost": [{"machine_id": r[0], "total": float(r[1] or 0)} for r in machine_cost],
    }
