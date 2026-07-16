"""
Unit tests for app.services.payroll_service (module 12).

STATUS: syntax-verified (`ast.parse`) only. NOT EXECUTED -- see
tests/conftest.py docstring for why and how to run these for real.
"""
import pytest
from datetime import date, timedelta
from decimal import Decimal

from app.services import payroll_service
from app.models.models import (
    Employee, SalaryType, BundleScanEvent, ApprovalStage, DocumentStatus,
)


@pytest.fixture()
def piece_rate_employee(db, tenant):
    emp = Employee(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        code="EMPPR1", full_name="Piece Rate Worker", date_of_joining=date.today(),
        salary_type=SalaryType.PIECE_RATE, is_worker=True,
    )
    db.add(emp)
    db.flush()
    return emp


def _make_scan_event(db, tenant, bundle, employee, amount_earned, scanned_at=None):
    ev = BundleScanEvent(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        bundle_id=bundle.id, employee_id=employee.id,
        quantity=bundle.quantity, amount_earned=amount_earned,
        scanned_at=scanned_at or date.today(),
    )
    db.add(ev)
    db.flush()
    return ev


# ==================== Production pay: quality-adjusted (core logic) ====================


def test_production_pay_full_when_no_rejects(db, tenant, sample_bundle, piece_rate_employee):
    _make_scan_event(db, tenant, sample_bundle, piece_rate_employee, 100.0)
    result = payroll_service.compute_production_pay(db, tenant, piece_rate_employee, date.today(), date.today())
    assert result["gross_production_pay"] == 100.0
    assert result["excluded_for_quality"] == 0.0


def test_production_pay_excludes_fully_rejected_bundle(db, tenant, sample_bundle, piece_rate_employee):
    from app.services import bundle_service
    _make_scan_event(db, tenant, sample_bundle, piece_rate_employee, 100.0)
    bundle_service.reject_bundle(db, tenant, sample_bundle, float(sample_bundle.quantity), "defect", actor_user_id=1)

    result = payroll_service.compute_production_pay(db, tenant, piece_rate_employee, date.today(), date.today())
    assert result["gross_production_pay"] == 0.0
    assert result["excluded_for_quality"] == 100.0


def test_production_pay_prorates_partial_reject(db, tenant, sample_bundle, piece_rate_employee):
    from app.services import bundle_service
    _make_scan_event(db, tenant, sample_bundle, piece_rate_employee, 100.0)
    # reject half the bundle's quantity
    half = float(sample_bundle.quantity) / 2
    bundle_service.reject_bundle(db, tenant, sample_bundle, half, "defect", actor_user_id=1)

    result = payroll_service.compute_production_pay(db, tenant, piece_rate_employee, date.today(), date.today())
    assert result["gross_production_pay"] == pytest.approx(50.0, abs=0.5)


def test_production_pay_rework_unpaid_by_default_policy(db, tenant, sample_bundle, piece_rate_employee):
    from app.services import bundle_service
    _make_scan_event(db, tenant, sample_bundle, piece_rate_employee, 100.0)
    bundle_service.start_rework(db, tenant, sample_bundle, "stitch defect", actor_user_id=1)

    result = payroll_service.compute_production_pay(db, tenant, piece_rate_employee, date.today(), date.today())
    assert result["gross_production_pay"] == 0.0  # default policy: rework_payable=False


def test_production_pay_rework_paid_when_policy_enables_it(db, tenant, sample_bundle, piece_rate_employee):
    from app.services import bundle_service
    policy = payroll_service.get_policy(db, tenant)
    policy.rework_payable = True
    policy.rework_pay_pct = Decimal("50")

    _make_scan_event(db, tenant, sample_bundle, piece_rate_employee, 100.0)
    bundle_service.start_rework(db, tenant, sample_bundle, "stitch defect", actor_user_id=1)

    result = payroll_service.compute_production_pay(db, tenant, piece_rate_employee, date.today(), date.today())
    assert result["gross_production_pay"] == pytest.approx(50.0, abs=0.5)


def test_production_pay_zero_scans_returns_zero(db, tenant, piece_rate_employee):
    result = payroll_service.compute_production_pay(db, tenant, piece_rate_employee, date.today(), date.today())
    assert result["gross_production_pay"] == 0.0
    assert result["scan_count"] == 0


# ==================== Salary slip generation ====================


def test_generate_salary_slip_rejects_duplicate(db, tenant, piece_rate_employee):
    today = date.today()
    payroll_service.generate_salary_slip(db, tenant, piece_rate_employee, actor_user_id=1, month=today.month, year=today.year)
    with pytest.raises(payroll_service.PayrollError, match="already exists"):
        payroll_service.generate_salary_slip(db, tenant, piece_rate_employee, actor_user_id=1, month=today.month, year=today.year)


def test_generate_salary_slip_creates_all_approval_stages(db, tenant, piece_rate_employee):
    from app.models.models import SalarySlipApproval
    today = date.today()
    slip = payroll_service.generate_salary_slip(db, tenant, piece_rate_employee, actor_user_id=1, month=today.month, year=today.year)
    stages = db.query(SalarySlipApproval).filter(SalarySlipApproval.salary_slip_id == slip.id).all()
    assert len(stages) == 4
    assert all(s.status == "pending" for s in stages)


# ==================== Approval chain (must be sequential) ====================


def test_approve_stage_rejects_out_of_order(db, tenant, piece_rate_employee):
    today = date.today()
    slip = payroll_service.generate_salary_slip(db, tenant, piece_rate_employee, actor_user_id=1, month=today.month, year=today.year)
    with pytest.raises(payroll_service.PayrollError, match="before"):
        payroll_service.approve_stage(db, tenant, slip, ApprovalStage.HR, actor_user_id=1)


def test_approve_stage_sequential_success_reaches_accounts(db, tenant, piece_rate_employee):
    today = date.today()
    slip = payroll_service.generate_salary_slip(db, tenant, piece_rate_employee, actor_user_id=1, month=today.month, year=today.year)
    payroll_service.approve_stage(db, tenant, slip, ApprovalStage.EMPLOYEE, actor_user_id=1)
    payroll_service.approve_stage(db, tenant, slip, ApprovalStage.SUPERVISOR, actor_user_id=1)
    payroll_service.approve_stage(db, tenant, slip, ApprovalStage.HR, actor_user_id=1)
    payroll_service.approve_stage(db, tenant, slip, ApprovalStage.ACCOUNTS, actor_user_id=1)
    assert slip.status == DocumentStatus.APPROVED


def test_reject_stage_sets_slip_rejected(db, tenant, piece_rate_employee):
    today = date.today()
    slip = payroll_service.generate_salary_slip(db, tenant, piece_rate_employee, actor_user_id=1, month=today.month, year=today.year)
    payroll_service.reject_stage(db, tenant, slip, ApprovalStage.EMPLOYEE, actor_user_id=1, remarks="Incorrect hours")
    assert slip.status == DocumentStatus.REJECTED


# ==================== Advance/loan deduction ====================


def test_advance_deduction_reduces_balance(db, tenant, piece_rate_employee):
    from app.models.models import EmployeeAdvance
    adv = EmployeeAdvance(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        employee_id=piece_rate_employee.id, advance_type="advance",
        amount=Decimal("1000"), installment_amount=Decimal("200"),
        balance_remaining=Decimal("1000"), issued_date=date.today(),
    )
    db.add(adv)
    db.flush()

    result = payroll_service.apply_advance_deduction(db, tenant, piece_rate_employee)
    assert result["advance_deduction"] == 200.0
    assert adv.balance_remaining == Decimal("800")
    assert adv.status == "active"


def test_advance_deduction_closes_when_balance_exhausted(db, tenant, piece_rate_employee):
    from app.models.models import EmployeeAdvance
    adv = EmployeeAdvance(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        employee_id=piece_rate_employee.id, advance_type="loan",
        amount=Decimal("100"), installment_amount=Decimal("200"),  # installment > remaining balance
        balance_remaining=Decimal("100"), issued_date=date.today(),
    )
    db.add(adv)
    db.flush()

    result = payroll_service.apply_advance_deduction(db, tenant, piece_rate_employee)
    assert result["loan_deduction"] == 100.0  # capped at remaining balance, not the full installment
    assert adv.balance_remaining == Decimal("0")
    assert adv.status == "closed"
