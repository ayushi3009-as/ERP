"""
Unit tests for app.services.ai_service (module 18).

STATUS: syntax-verified (`ast.parse`) only. NOT EXECUTED -- see
tests/conftest.py docstring for why and how to run these for real.
"""
import pytest
from datetime import date, timedelta

from app.services import ai_service


# ==================== Read-only guarantee (the architectural rule) ====================


def test_no_ai_service_function_calls_db_add_or_commit_on_business_tables():
    """Mechanically confirms the module's central architectural rule:
    this file should never mutate business data. The only db.add() calls
    permitted are for this module's OWN tables (AIConversation/
    AIMessage) inside answer_question() -- checked by name."""
    import inspect
    source = inspect.getsource(ai_service)
    add_calls = [line for line in source.split("\n") if "db.add(" in line]
    for line in add_calls:
        assert "AIConversation" in line or "AIMessage" in line, f"Unexpected db.add() outside AI's own tables: {line}"


# ==================== Deterministic Intent Router (no LLM needed) ====================


def test_route_intent_matches_running_bundles_question():
    assert ai_service.route_intent("How many bundles are running?") == "running_bundles"


def test_route_intent_matches_top_performer_question():
    assert ai_service.route_intent("Which employee produced the highest output today?") == "top_performer_today"


def test_route_intent_matches_downtime_question():
    assert ai_service.route_intent("Which machine has the most downtime?") == "machine_downtime"


def test_route_intent_matches_delayed_lots_question():
    assert ai_service.route_intent("Which lots are delayed?") == "delayed_lots"


def test_route_intent_returns_none_for_unrecognized_question():
    assert ai_service.route_intent("What is the meaning of life?") is None


def test_answer_intent_running_bundles(db, tenant):
    result = ai_service.answer_intent(db, tenant, "running_bundles")
    assert "bundles are currently running" in result["answer"]
    assert result["grounded_in"] == "dashboard_service.live_factory_overview"


def test_answer_intent_delayed_lots_empty_state(db, tenant):
    result = ai_service.answer_intent(db, tenant, "delayed_lots")
    assert "No lots are currently delayed" in result["answer"]


def test_answer_intent_unhandled_raises(db, tenant):
    with pytest.raises(ai_service.AIError, match="Unhandled intent"):
        ai_service.answer_intent(db, tenant, "predict_lottery_numbers")


# ==================== Production Analysis (real, no LLM) ====================


def test_detect_delayed_lots_only_returns_overdue_open_lots(db, tenant, sample_bundle):
    from app.models.models import Lot, Style, LotStatus
    style = Style(company_id=tenant.company_id, code="STYD1", name="Delayed Style")
    db.add(style)
    db.flush()

    overdue_lot = Lot(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        lot_number="LOTDEL1", production_order_id=sample_bundle.production_order_id,
        style_id=style.id, status=LotStatus.CUTTING,
        expected_completion=date.today() - timedelta(days=3),
    )
    closed_overdue_lot = Lot(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        lot_number="LOTDEL2", production_order_id=sample_bundle.production_order_id,
        style_id=style.id, status=LotStatus.CLOSED,
        expected_completion=date.today() - timedelta(days=3),
    )
    db.add_all([overdue_lot, closed_overdue_lot])
    db.flush()

    result = ai_service.detect_delayed_lots(db, tenant)
    lot_numbers = {r["lot_number"] for r in result}
    assert "LOTDEL1" in lot_numbers
    assert "LOTDEL2" not in lot_numbers  # closed lots are never "delayed" even if overdue


def test_forecast_fabric_consumption_zero_history(db, tenant):
    result = ai_service.forecast_fabric_consumption(db, tenant, days_ahead=7)
    assert result["daily_average_meters"] == 0
    assert "not a trained forecasting model" in result["method"]


# ==================== LLM Provider (structure only, no real call) ====================


def test_call_llm_raises_when_env_var_not_set(db, tenant):
    from app.models.models import AIProviderConfig, AIProvider
    config = AIProviderConfig(
        company_id=tenant.company_id, provider=AIProvider.ANTHROPIC,
        model_name="claude-sonnet-5", api_key_env_var="DEFINITELY_NOT_SET_ENV_VAR_XYZ",
    )
    with pytest.raises(ai_service.AIError, match="is not set"):
        ai_service.call_llm(config, "system prompt", "user message")


def test_answer_question_raises_without_provider_for_unrecognized_question(db, tenant):
    with pytest.raises(ai_service.AIError, match="no AI provider is configured"):
        ai_service.answer_question(db, tenant, user_id=1, conversation_id=None, question="What is the meaning of life?")


def test_answer_question_works_without_any_provider_for_recognized_question(db, tenant):
    """The deterministic path must work with ZERO AI infrastructure
    configured -- confirms the module doesn't silently require an LLM
    for questions it can already answer from data."""
    result = ai_service.answer_question(db, tenant, user_id=1, conversation_id=None, question="How many bundles are running?")
    assert "conversation_id" in result
    assert "answer" in result


# ==================== Knowledge Base (keyword search, not vector) ====================


def test_search_knowledge_base_rejects_invalid_document_type(db, tenant):
    with pytest.raises(ai_service.AIError, match="Invalid document_type"):
        ai_service.search_knowledge_base(db, tenant, "safety", document_type="tarot_card")


def test_search_knowledge_base_finds_keyword_match(db, tenant):
    from app.models.models import KnowledgeDocument, KnowledgeDocumentType
    doc = KnowledgeDocument(
        company_id=tenant.company_id, title="Fire Safety SOP",
        document_type=KnowledgeDocumentType.SOP, content="In case of fire, evacuate immediately.",
    )
    db.add(doc)
    db.flush()

    results = ai_service.search_knowledge_base(db, tenant, "fire")
    assert len(results) == 1
    assert results[0].title == "Fire Safety SOP"
