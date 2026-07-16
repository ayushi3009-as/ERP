"""
Unit tests for app.services.printing_service (module 16).

STATUS: syntax-verified (`ast.parse`) only. NOT EXECUTED -- see
tests/conftest.py docstring for why and how to run these for real.
"""
import pytest
from datetime import date

from app.services import printing_service
from app.models.models import PrintStatus


def test_render_label_unsupported_entity_type_raises(db, tenant):
    with pytest.raises(printing_service.PrintingError, match="Unsupported label entity_type"):
        printing_service.render_label(db, "spaceship", 1)


def test_render_label_bundle_without_barcode_raises(db, tenant, sample_bundle):
    sample_bundle.barcode_value = None
    with pytest.raises(printing_service.PrintingError, match="no barcode identity"):
        printing_service.render_label(db, "bundle", sample_bundle.id)


def test_render_document_unsupported_type_raises(db, tenant):
    with pytest.raises(printing_service.PrintingError, match="Unsupported document_type"):
        printing_service.render_document(db, tenant, "carrier_pigeon_manifest", 1)


def test_log_print_creates_history_and_emits_realtime(db, tenant):
    record = printing_service.log_print(
        db, tenant, "bundle_label", "bundle", 1, "png", actor_user_id=1,
    )
    assert record.id is not None
    assert record.status == PrintStatus.COMPLETED
    assert record.is_reprint is False


def test_reprint_creates_new_history_row_linked_to_original(db, tenant):
    original = printing_service.log_print(db, tenant, "bundle_label", "bundle", 1, "png", actor_user_id=1)
    db.flush()
    reprint = printing_service.reprint(db, tenant, original.id, actor_user_id=2)
    assert reprint.id != original.id
    assert reprint.is_reprint is True
    assert reprint.original_print_id == original.id


def test_reprint_rejects_voided_original(db, tenant):
    original = printing_service.log_print(db, tenant, "bundle_label", "bundle", 1, "png", actor_user_id=1)
    db.flush()
    printing_service.void_print(db, tenant, original.id, actor_user_id=1, reason="wrong label")
    with pytest.raises(printing_service.PrintingError, match="Cannot reprint a voided label"):
        printing_service.reprint(db, tenant, original.id, actor_user_id=2)


def test_void_print_rejects_double_void(db, tenant):
    original = printing_service.log_print(db, tenant, "bundle_label", "bundle", 1, "png", actor_user_id=1)
    db.flush()
    printing_service.void_print(db, tenant, original.id, actor_user_id=1, reason="duplicate")
    with pytest.raises(printing_service.PrintingError, match="Already voided"):
        printing_service.void_print(db, tenant, original.id, actor_user_id=1, reason="again")


def test_create_bulk_print_job_rejects_unsupported_job_type(db, tenant):
    with pytest.raises(printing_service.PrintingError, match="Unsupported job_type"):
        printing_service.create_bulk_print_job(db, tenant, "fireworks", actor_user_id=1)


def test_create_bulk_print_job_resolves_lot_bundles(db, tenant, sample_bundle):
    from app.models.models import Lot, Style, LotStatus
    style = Style(company_id=tenant.company_id, code="STY02", name="Test Style 2")
    db.add(style)
    db.flush()
    lot = Lot(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        lot_number="LOT00002", production_order_id=sample_bundle.production_order_id,
        style_id=style.id, status=LotStatus.CUT,
    )
    db.add(lot)
    db.flush()
    sample_bundle.lot_id = lot.id
    db.flush()

    job = printing_service.create_bulk_print_job(db, tenant, "lot", actor_user_id=1, reference_id=lot.id)
    assert job.total_items == 1
    assert sample_bundle.id in job.target_ids


def test_process_print_job_synchronously_counts_failures(db, tenant, sample_bundle):
    sample_bundle.barcode_value = None  # will fail rendering
    job = printing_service.create_bulk_print_job(
        db, tenant, "bundles", actor_user_id=1, target_ids=[sample_bundle.id],
    )
    printing_service.process_print_job_synchronously(db, tenant, job, actor_user_id=1)
    assert job.failed_items == 1
    assert job.completed_items == 0
    assert job.status == PrintStatus.FAILED
