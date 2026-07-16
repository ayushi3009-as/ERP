"""
Unit tests for app.services.quality_service (module 11).

STATUS: syntax-verified (`ast.parse`) only. NOT EXECUTED — see
tests/conftest.py docstring for why and how to run these for real.
"""
import pytest
from datetime import date

from app.services import quality_service
from app.models.models import QCResult, BundleStatus


def test_create_quality_check_rejects_nonpositive_inspected_quantity(db, tenant):
    with pytest.raises(quality_service.QualityCheckError, match="must be positive"):
        quality_service.create_quality_check(
            db, tenant, actor_user_id=1, qc_date=date.today(), qc_type="final",
            inspected_quantity=0,
        )


def test_create_quality_check_rejects_invalid_qc_type(db, tenant):
    with pytest.raises(quality_service.QualityCheckError, match="Invalid qc_type"):
        quality_service.create_quality_check(
            db, tenant, actor_user_id=1, qc_date=date.today(), qc_type="ultimate",
            inspected_quantity=10,
        )


def test_create_quality_check_rejects_dispositioned_exceeding_inspected(db, tenant):
    with pytest.raises(quality_service.QualityCheckError, match="cannot exceed"):
        quality_service.create_quality_check(
            db, tenant, actor_user_id=1, qc_date=date.today(), qc_type="final",
            inspected_quantity=10, passed_quantity=8, rejected_quantity=5,
        )


def test_create_quality_check_determines_pass_result(db, tenant):
    qc = quality_service.create_quality_check(
        db, tenant, actor_user_id=1, qc_date=date.today(), qc_type="final",
        inspected_quantity=10, passed_quantity=10,
    )
    assert qc.result == QCResult.PASS
    assert qc.barcode_value is not None  # minted via barcode_service


def test_create_quality_check_determines_fail_result(db, tenant):
    qc = quality_service.create_quality_check(
        db, tenant, actor_user_id=1, qc_date=date.today(), qc_type="final",
        inspected_quantity=10, rejected_quantity=3, passed_quantity=7,
    )
    assert qc.result == QCResult.FAIL


def test_inspect_bundle_requires_full_quantity_accounted(db, tenant, sample_bundle):
    with pytest.raises(quality_service.QualityCheckError, match="must equal"):
        quality_service.inspect_bundle(
            db, tenant, sample_bundle, actor_user_id=1, qc_type="in_process",
            passed_quantity=10, rejected_quantity=0, rework_quantity=0,  # bundle qty is 50
        )


def test_inspect_bundle_all_pass_creates_no_reject_or_rework(db, tenant, sample_bundle):
    result = quality_service.inspect_bundle(
        db, tenant, sample_bundle, actor_user_id=1, qc_type="final",
        passed_quantity=50, rejected_quantity=0, rework_quantity=0,
    )
    assert result["bundle_reject_id"] is None
    assert result["bundle_rework_id"] is None
    assert result["result"] == "pass"


def test_inspect_bundle_partial_reject_delegates_to_bundle_service(db, tenant, sample_bundle):
    """Confirms this module does NOT reimplement bundle rejection — the
    bundle's status must change via bundle_service.reject_bundle()."""
    result = quality_service.inspect_bundle(
        db, tenant, sample_bundle, actor_user_id=1, qc_type="in_process",
        passed_quantity=40, rejected_quantity=10, rework_quantity=0,
        defect_description="Stitching defect",
    )
    assert result["bundle_reject_id"] is not None
    assert sample_bundle.status == BundleStatus.REJECTED


def test_inspect_bundle_rework_delegates_to_bundle_service(db, tenant, sample_bundle):
    result = quality_service.inspect_bundle(
        db, tenant, sample_bundle, actor_user_id=1, qc_type="in_process",
        passed_quantity=30, rejected_quantity=0, rework_quantity=20,
    )
    assert result["bundle_rework_id"] is not None
    assert sample_bundle.status == BundleStatus.REWORK


def test_quality_dashboard_unifies_qc_and_bundle_level(db, tenant, sample_bundle):
    quality_service.create_quality_check(
        db, tenant, actor_user_id=1, qc_date=date.today(), qc_type="final",
        inspected_quantity=10, passed_quantity=10,
    )
    quality_service.inspect_bundle(
        db, tenant, sample_bundle, actor_user_id=1, qc_type="in_process",
        passed_quantity=45, rejected_quantity=5, rework_quantity=0,
    )
    dashboard = quality_service.get_quality_dashboard(db, tenant, date.today(), date.today())
    assert dashboard["quality_checks"]["total"] >= 1
    assert dashboard["bundle_level"]["rejects"] >= 1


# ==================== Phase A: Quality Standards ====================


def test_create_quality_standard_requires_name(db, tenant):
    with pytest.raises(quality_service.QualityCheckError, match="name is required"):
        quality_service.create_quality_standard(db, tenant, actor_user_id=1, name="")


def test_create_quality_standard_success(db, tenant):
    standard = quality_service.create_quality_standard(
        db, tenant, actor_user_id=1, name="Standard Shirt QC",
        inspection_checklist=["collar", "buttons", "stitching"],
        sampling_rules={"aql_level": "2.5"},
    )
    assert standard.name == "Standard Shirt QC"
    assert standard.inspection_checklist == ["collar", "buttons", "stitching"]


# ==================== Phase D: Quality Gates ====================


def test_gate_blocks_bundle_with_no_inspection(db, tenant, sample_bundle):
    from app.models.models import ProductionStage
    with pytest.raises(quality_service.QualityCheckError, match="no quality inspection"):
        quality_service.check_gate_approval(db, tenant, sample_bundle, ProductionStage.PACKING)


def test_gate_blocks_bundle_with_failed_inspection(db, tenant, sample_bundle):
    from app.models.models import ProductionStage
    quality_service.inspect_bundle(
        db, tenant, sample_bundle, actor_user_id=1, qc_type="in_process",
        passed_quantity=0, rejected_quantity=50, rework_quantity=0,
    )
    with pytest.raises(quality_service.QualityCheckError, match="not 'pass'"):
        quality_service.check_gate_approval(db, tenant, sample_bundle, ProductionStage.PACKING)


def test_gate_allows_bundle_with_passed_inspection(db, tenant, sample_bundle):
    from app.models.models import ProductionStage
    quality_service.inspect_bundle(
        db, tenant, sample_bundle, actor_user_id=1, qc_type="final",
        passed_quantity=50, rejected_quantity=0, rework_quantity=0,
    )
    # should not raise
    quality_service.check_gate_approval(db, tenant, sample_bundle, ProductionStage.PACKING)


def test_gate_does_not_apply_to_ungated_stages(db, tenant, sample_bundle):
    from app.models.models import ProductionStage
    # no inspection recorded at all, but STITCHING isn't a gated stage
    quality_service.check_gate_approval(db, tenant, sample_bundle, ProductionStage.STITCHING)


# ==================== Phase E: CAPA ====================


def test_create_capa_requires_root_cause(db, tenant):
    with pytest.raises(quality_service.QualityCheckError, match="root_cause is required"):
        quality_service.create_capa(db, tenant, actor_user_id=1, root_cause="")


def test_close_capa_rejects_already_closed(db, tenant):
    capa = quality_service.create_capa(db, tenant, actor_user_id=1, root_cause="Needle misalignment")
    quality_service.close_capa(db, tenant, capa, actor_user_id=1)
    with pytest.raises(quality_service.QualityCheckError, match="already closed"):
        quality_service.close_capa(db, tenant, capa, actor_user_id=1)


def test_overdue_capas_excludes_future_target_dates(db, tenant):
    from datetime import timedelta, date as date_cls
    quality_service.create_capa(
        db, tenant, actor_user_id=1, root_cause="test",
        target_date=date_cls.today() + timedelta(days=10),
    )
    overdue = quality_service.get_overdue_capas(db, tenant)
    assert len(overdue) == 0


def test_overdue_capas_includes_past_target_dates(db, tenant):
    from datetime import timedelta, date as date_cls
    quality_service.create_capa(
        db, tenant, actor_user_id=1, root_cause="test",
        target_date=date_cls.today() - timedelta(days=1),
    )
    overdue = quality_service.get_overdue_capas(db, tenant)
    assert len(overdue) == 1


# ==================== Phase F: KPIs ====================


def test_compute_kpis_zero_inspections_returns_none_rates(db, tenant):
    from datetime import date as date_cls
    kpis = quality_service.compute_kpis(db, tenant, date_cls.today(), date_cls.today())
    assert kpis["first_pass_yield_pct"] is None
    assert kpis["customer_return_pct"] is None  # explicitly not fabricated


def test_compute_kpis_first_pass_yield(db, tenant):
    from datetime import date as date_cls
    quality_service.create_quality_check(
        db, tenant, actor_user_id=1, qc_date=date_cls.today(), qc_type="final",
        inspected_quantity=100, passed_quantity=90, rejected_quantity=10,
    )
    kpis = quality_service.compute_kpis(db, tenant, date_cls.today(), date_cls.today())
    assert kpis["first_pass_yield_pct"] == 90.0
    assert kpis["reject_pct"] == 10.0
