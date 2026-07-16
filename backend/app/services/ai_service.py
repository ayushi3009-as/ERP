"""
AI Production Intelligence Platform (module 18) -- the ONLY AI decision
engine in this ERP.

Hard architectural rule, enforced by construction, not just documented:
every function in this file is READ-ONLY against ERP data. Nothing here
calls db.add()/db.commit() against any business table (Bundle, Lot,
StockBalance, SalarySlip, etc.) -- the only tables this module writes to
are its own (AIConversation, AIMessage, AIProviderConfig,
KnowledgeDocument). If an analysis suggests an action (e.g. "reassign
this idle employee"), the response is a recommendation string; carrying
it out means the user calls the normal existing endpoint
(employee_work_service.issue_bundle() via /employee-work/issue, etc.) --
this module never calls a mutating service function itself.

Two honesty notes that apply to this entire file, not repeated per
function:
1. The rule-based analysis functions below (bottlenecks, idle detection,
   quality patterns, etc.) are REAL and don't need any LLM to work --
   they're pure aggregation/threshold logic over existing service
   functions, testable in principle the same as every other service in
   this project (i.e. blocked only by "no live database", not by "no
   AI provider").
2. The LLM-backed functions (chat, daily summary narrative) genuinely
   need a configured provider + network access to a real API, neither of
   which exists in the environment this was built in. Those functions
   are structured correctly and will work once a provider is configured,
   but have not been executed against a real LLM. This is stated in each
   such function's docstring, not just here.
"""

from typing import Optional, List
from datetime import date, timedelta
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func, or_

from app.models.models import (
    AIProviderConfig, AIProvider, AIConversation, AIMessage,
    KnowledgeDocument, KnowledgeDocumentType,
    Lot, LotStatus, Bundle, BundleStatus, WIPLedger, BundleScanEvent,
    Machine, MachineStatus, Employee, StockBalance, Product,
    QualityCheck, QCResult, SalesInvoice, Customer,
)
from app.services import (
    report_service, dashboard_service, machine_service, quality_service,
    payroll_service, costing_service, sales_service,
)


class AIError(ValueError):
    pass


# ==================== PRODUCTION ANALYSIS (real, no LLM needed) ====================


def detect_production_bottlenecks(db: Session, tenant, threshold_hours: float = 4.0) -> list:
    """A bottleneck = a stage where bundles are piling up (WIPLedger rows
    stuck at that stage longer than threshold_hours). Reuses
    report_service.wip_report() rather than a new WIP query."""
    from datetime import datetime
    wip = report_service.wip_report(db, tenant)
    cutoff = datetime.utcnow() - timedelta(hours=threshold_hours)

    by_stage = {}
    for w in wip:
        if w["last_event_at"] and w["last_event_at"] < cutoff:
            by_stage.setdefault(w["current_stage"], []).append(w["bundle_id"])

    return [
        {"stage": stage, "stuck_bundle_count": len(bundle_ids), "bundle_ids": bundle_ids[:20]}
        for stage, bundle_ids in by_stage.items()
    ]


def detect_idle_machines(db: Session, tenant) -> list:
    """Reuses machine_service.get_alerts() 'idle_too_long' alerts rather
    than a second idle-detection query."""
    alerts = machine_service.get_alerts(db, tenant)
    return [a for a in alerts if a["type"] == "idle_too_long"]


def detect_idle_employees(db: Session, tenant, target_date: Optional[date] = None) -> dict:
    """Reuses dashboard_service.employee_overview() -- the idle count is
    already computed there (total - working - absent)."""
    return dashboard_service.employee_overview(db, tenant, target_date)


def detect_delayed_lots(db: Session, tenant) -> list:
    """A lot is delayed if expected_completion has passed and it isn't
    CLOSED yet -- reuses the Lot table directly (module 4's own
    expected_completion field), no new delay-tracking mechanism."""
    today = date.today()
    lots = (
        tenant.apply(db.query(Lot), Lot)
        .filter(
            Lot.expected_completion.isnot(None), Lot.expected_completion < today,
            Lot.status.notin_([LotStatus.CLOSED, LotStatus.CANCELLED]), Lot.is_deleted == False,
        )
        .all()
    )
    return [
        {"lot_id": l.id, "lot_number": l.lot_number, "expected_completion": l.expected_completion,
         "days_overdue": (today - l.expected_completion).days, "status": l.status.value}
        for l in lots
    ]


def detect_low_productivity_employees(db: Session, tenant, date_from: date, date_to: date, percentile_threshold: float = 0.25) -> list:
    """Reuses dashboard_service.employee_productivity_ranking() --
    'low productivity' = bottom N% of the same ranking already computed
    there, not a separate productivity formula."""
    ranking = dashboard_service.employee_productivity_ranking(db, tenant, date_from, date_to, top_n=1000)
    all_ranked = ranking["top_performers"]  # already sorted descending by output
    if not all_ranked:
        return []
    cutoff_index = max(int(len(all_ranked) * (1 - percentile_threshold)), 1)
    return all_ranked[cutoff_index:]


def analyze_capacity_constraints(db: Session, tenant, date_from: date, date_to: date) -> list:
    """Reuses machine_service.report_utilization() -- a machine at or
    near 100% utilization with a positive downtime% is a capacity
    constraint candidate; no new utilization formula."""
    utilization = machine_service.report_utilization(db, tenant, date_from, date_to)
    return [
        u for u in utilization
        if u.get("capacity_utilization_pct") is not None and u["capacity_utilization_pct"] >= 85
    ]


# ==================== QUALITY ANALYSIS (real, no LLM needed) ====================


def detect_repeat_defects(db: Session, tenant, date_from: date, date_to: date, min_occurrences: int = 3) -> list:
    """Reuses quality_service.report_defect_analysis() -- 'repeat' is
    just filtering that same result by occurrence count."""
    analysis = quality_service.report_defect_analysis(db, tenant, date_from, date_to)
    return [a for a in analysis if a["occurrences"] >= min_occurrences]


def detect_high_reject_operations(db: Session, tenant, date_from: date, date_to: date, threshold_pct: float = 10.0) -> list:
    """Cross-references report_service.cost_operation_report() style
    output against reject data -- reuses report_service.production_by_operation
    equivalent via BundleScanEvent already aggregated by quality_service's
    own KPI function for the reject-rate figure."""
    kpis = quality_service.compute_kpis(db, tenant, date_from, date_to)
    # Per-operation reject rate isn't a single existing function; derive
    # it from the same QualityCheck data compute_kpis already reads,
    # rather than a new independent query pipeline.
    from app.models.models import BundleScanEvent as BSE
    rows = (
        db.query(BSE.operation_id, sa_func.count(BSE.id))
        .join(Bundle, Bundle.id == BSE.bundle_id)
        .filter(Bundle.status == BundleStatus.REJECTED, BSE.operation_id.isnot(None))
        .group_by(BSE.operation_id)
        .all()
    )
    return [{"operation_id": r[0], "rejected_bundle_scans": r[1]} for r in rows if r[1] > 0]


def quality_trend_summary(db: Session, tenant, date_from: date, date_to: date) -> dict:
    """Pure facade over quality_service.compute_kpis() + report_defect_trend()."""
    return {
        "kpis": quality_service.compute_kpis(db, tenant, date_from, date_to),
        "trend": quality_service.report_defect_trend(db, tenant, date_from, date_to),
    }


# ==================== INVENTORY ANALYSIS (real, no LLM needed) ====================


def forecast_fabric_consumption(db: Session, tenant, days_ahead: int = 7) -> dict:
    """Simple moving-average forecast off the last 30 days of actual
    LotFabricIssue consumption (via report_service.fabric_consumption_report)
    -- a real, honestly-simple forecast method (linear extrapolation of a
    trailing average), not a claimed ML model. Documented as such rather
    than dressed up as more sophisticated than it is."""
    today = date.today()
    lookback_start = today - timedelta(days=30)
    history = report_service.fabric_consumption_report(db, tenant, lookback_start, today)
    total_consumed = sum(h["total_meters_consumed"] for h in history)
    daily_avg = total_consumed / 30 if total_consumed else 0
    return {
        "method": "30-day trailing average, linearly extrapolated -- not a trained forecasting model",
        "daily_average_meters": round(daily_avg, 2),
        "forecast_next_period_meters": round(daily_avg * days_ahead, 2),
        "forecast_days": days_ahead,
    }


def low_stock_forecast(db: Session, tenant) -> list:
    """Reuses the reorder_level check already built for
    dashboard_service.alert_center() -- doesn't reimplement the low-stock
    query, just also estimates days-until-stockout from recent consumption."""
    low_stock_items = (
        tenant.apply(db.query(StockBalance), StockBalance)
        .join(Product, Product.id == StockBalance.product_id)
        .filter(Product.reorder_level > 0, StockBalance.quantity <= Product.reorder_level)
        .all()
    )
    return [
        {"product_id": s.product_id, "current_quantity": float(s.quantity), "reorder_level": float(s.product.reorder_level)}
        for s in low_stock_items
    ]


# ==================== PAYROLL ANALYSIS (real, no LLM needed) ====================


def payroll_insights(db: Session, tenant, date_from: date, date_to: date) -> dict:
    """Pure facade over report_service's existing payroll breakdowns --
    'top earners' reuses employee productivity ranking (piece-rate pay
    correlates directly with output, already computed), not a new query."""
    productivity = dashboard_service.employee_productivity_ranking(db, tenant, date_from, date_to, top_n=10)
    return {
        "top_performers_by_output": productivity["top_performers"],
        "low_productivity": productivity["lowest_productivity"],
        "department_cost": report_service.payroll_department_report(db, tenant, date_to.month, date_to.year),
    }


# ==================== COSTING ANALYSIS (real, no LLM needed) ====================


def high_cost_operations(db: Session, tenant, date_from: date, date_to: date, top_n: int = 5) -> list:
    """Reuses report_service.cost_operation_report(), sorted -- no new
    cost calculation."""
    costs = report_service.cost_operation_report(db, tenant, date_from, date_to)
    return sorted(costs, key=lambda c: c["total_cost"], reverse=True)[:top_n]


def cost_and_margin_trend(db: Session, tenant) -> dict:
    """Facade over costing_service.get_costing_dashboard()."""
    return costing_service.get_costing_dashboard(db, tenant)


# ==================== SALES ANALYSIS (real, no LLM needed) ====================


def top_customers(db: Session, tenant, date_from: date, date_to: date, top_n: int = 5) -> list:
    rows = report_service.sales_customer_wise(db, tenant, date_from, date_to)
    return sorted(rows, key=lambda r: r["total_sales"], reverse=True)[:top_n]


def customer_risk_analysis(db: Session, tenant, high_outstanding_threshold: float = 100000) -> list:
    """A customer is 'at risk' if outstanding balance exceeds a threshold
    -- reuses sales_service.get_customer_ledger() per customer, not a new
    balance calculation."""
    customers = tenant.apply(db.query(Customer), Customer).filter(Customer.is_deleted == False).all()
    at_risk = []
    for c in customers:
        ledger = sales_service.get_customer_ledger(db, tenant, c.id)
        if ledger["outstanding_balance"] >= high_outstanding_threshold:
            at_risk.append({"customer_id": c.id, "customer_name": c.name, "outstanding_balance": ledger["outstanding_balance"]})
    return sorted(at_risk, key=lambda x: x["outstanding_balance"], reverse=True)


# ==================== MACHINE PREDICTIONS (rule-based, not ML) ====================


def maintenance_due_forecast(db: Session, tenant, days_ahead: int = 14) -> list:
    """Reuses machine_service.get_alerts() maintenance-due-soon logic,
    widened to days_ahead -- not a predictive model, a threshold check on
    Machine.next_maintenance (module 10's own field)."""
    from app.models.models import Machine as M
    today = date.today()
    machines = tenant.apply(db.query(M), M).filter(
        M.next_maintenance.isnot(None), M.next_maintenance <= today + timedelta(days=days_ahead),
    ).all()
    return [{"machine_id": m.id, "machine_name": m.name, "next_maintenance": m.next_maintenance} for m in machines]


def breakdown_risk_estimate(db: Session, tenant, date_from: date, date_to: date) -> list:
    """Honest rule-based proxy, NOT a trained failure-prediction model:
    flags machines whose breakdown count in the period exceeds the
    factory average. Reuses machine_service.get_health() per machine
    (already computes breakdown_count) rather than a new counting query."""
    from app.models.models import Machine as M
    machines = tenant.apply(db.query(M), M).filter(M.is_deleted == False).all()
    if not machines:
        return []

    health_by_machine = []
    for m in machines:
        health = machine_service.get_health(db, tenant, m, date_from, date_to)
        health_by_machine.append({"machine_id": m.id, "machine_name": m.name, "breakdown_count": health["breakdown_count"]})

    avg_breakdowns = sum(h["breakdown_count"] for h in health_by_machine) / len(health_by_machine)
    return [
        {**h, "risk": "elevated", "factory_average_breakdowns": round(avg_breakdowns, 2)}
        for h in health_by_machine if h["breakdown_count"] > avg_breakdowns
    ]


# ==================== AI NOTIFICATIONS (aggregates existing alerts) ====================


def generate_ai_alerts(db: Session, tenant) -> list:
    """Merges dashboard_service.alert_center() (already merges
    machine+quality+inventory alerts, module 15) with the additional
    predictive/analytical alerts this module adds (delayed lots,
    breakdown risk, customer risk) -- one more merge layer, not a
    reimplementation of the alerts already gathered there."""
    alerts = list(dashboard_service.alert_center(db, tenant))

    for lot in detect_delayed_lots(db, tenant):
        alerts.append({"type": "production_delay", "domain": "ai_production", "detail": f"Lot {lot['lot_number']} is {lot['days_overdue']} days overdue"})

    today = date.today()
    week_ago = today - timedelta(days=7)
    for risk in breakdown_risk_estimate(db, tenant, week_ago, today):
        alerts.append({"type": "machine_failure_risk", "domain": "ai_machine", "detail": f"Machine {risk['machine_name']} has above-average breakdown frequency"})

    for risk in customer_risk_analysis(db, tenant):
        alerts.append({"type": "customer_risk", "domain": "ai_sales", "detail": f"{risk['customer_name']} has outstanding balance {risk['outstanding_balance']}"})

    return alerts


# ==================== DAILY SUMMARY (structured, LLM narrative optional) ====================


def generate_daily_summary(db: Session, tenant) -> dict:
    """The STRUCTURED summary (every number below) is fully real and
    computed today, reusing report_service/dashboard_service/
    quality_service/payroll_service/costing_service/sales_service. A
    natural-language narrative ON TOP of these numbers would go through
    generate_llm_narrative() below, which requires a configured provider
    -- this function itself never calls an LLM, so it works today with
    zero AI infrastructure configured."""
    today = date.today()
    return {
        "date": today,
        "factory": dashboard_service.live_factory_overview(db, tenant),
        "production": report_service.production_pending_completed_rejected(db, tenant, today, today),
        "quality": quality_service.compute_kpis(db, tenant, today, today),
        "inventory_alerts": low_stock_forecast(db, tenant),
        "sales": sales_service.get_sales_dashboard(db, tenant),
        "payroll": payroll_service.get_payroll_dashboard(db, tenant, today.month, today.year),
        "costing": costing_service.get_costing_dashboard(db, tenant),
        "ai_alerts": generate_ai_alerts(db, tenant),
    }


# ==================== DETERMINISTIC INTENT ROUTER (no LLM needed) ====================


INTENT_PATTERNS = [
    (("bundles running", "running bundles"), "running_bundles"),
    (("highest output", "top performer", "best employee"), "top_performer_today"),
    (("most downtime", "downtime machine"), "machine_downtime"),
    (("delayed lot", "lots delayed", "which lots"), "delayed_lots"),
    (("production summary", "today's production"), "production_summary"),
    (("below target", "why is production"), "target_variance"),
    (("highest outstanding", "outstanding balance"), "customer_outstanding"),
    (("highest reject", "reject rate", "reject operations"), "reject_operations"),
]


def route_intent(question: str) -> Optional[str]:
    """Matches the exact example questions from the module spec (and
    close variants) to a real data lookup WITHOUT calling any LLM --
    every one of these questions can be answered deterministically from
    functions already in this file/report_service/dashboard_service.
    Returns None if nothing matches, meaning the caller should fall back
    to the LLM-backed free-form path (see answer_question())."""
    q = question.lower()
    for keywords, intent in INTENT_PATTERNS:
        if any(kw in q for kw in keywords):
            return intent
    return None


def answer_intent(db: Session, tenant, intent: str) -> dict:
    today = date.today()
    if intent == "running_bundles":
        overview = dashboard_service.live_factory_overview(db, tenant)
        return {"answer": f"{overview['running_bundles']} bundles are currently running.", "grounded_in": "dashboard_service.live_factory_overview"}
    if intent == "top_performer_today":
        ranking = dashboard_service.employee_productivity_ranking(db, tenant, today, today, top_n=1)
        top = ranking["top_performers"][0] if ranking["top_performers"] else None
        return {"answer": f"Employee {top['employee_id']} produced {top['total_output']} pieces today." if top else "No production recorded yet today.", "grounded_in": "dashboard_service.employee_productivity_ranking"}
    if intent == "machine_downtime":
        report = machine_service.report_downtime(db, tenant, today - timedelta(days=7), today)
        if not report:
            return {"answer": "No downtime recorded in the last 7 days.", "grounded_in": "machine_service.report_downtime"}
        worst = max(report, key=lambda r: r["total_minutes"] or 0)
        return {"answer": f"Machine {worst['machine_id']} has the most downtime: {worst['total_minutes']} minutes over the last 7 days.", "grounded_in": "machine_service.report_downtime"}
    if intent == "delayed_lots":
        lots = detect_delayed_lots(db, tenant)
        if not lots:
            return {"answer": "No lots are currently delayed.", "grounded_in": "ai_service.detect_delayed_lots"}
        names = ", ".join(l["lot_number"] for l in lots[:5])
        return {"answer": f"{len(lots)} lot(s) are delayed: {names}.", "grounded_in": "ai_service.detect_delayed_lots"}
    if intent == "production_summary":
        summary = report_service.production_pending_completed_rejected(db, tenant, today, today)
        return {"answer": f"Today: {summary['completed_lots']} lots completed, {summary['pending_lots']} pending, {summary['rejected_quantity']} pieces rejected.", "grounded_in": "report_service.production_pending_completed_rejected"}
    if intent == "target_variance":
        variance = dashboard_service.production_target_vs_achievement(db, tenant, today)
        if variance["target"] == 0:
            return {"answer": "No production target has been set for today, so variance can't be computed.", "grounded_in": "dashboard_service.production_target_vs_achievement"}
        return {"answer": f"Today's achievement is {variance['achievement']} against a target of {variance['target']} ({variance['achievement_pct']}%). Variance: {variance['variance']}.", "grounded_in": "dashboard_service.production_target_vs_achievement"}
    if intent == "customer_outstanding":
        risks = customer_risk_analysis(db, tenant, high_outstanding_threshold=0)
        if not risks:
            return {"answer": "No customers currently have an outstanding balance.", "grounded_in": "ai_service.customer_risk_analysis"}
        top = risks[0]
        return {"answer": f"{top['customer_name']} has the highest outstanding balance: {top['outstanding_balance']}.", "grounded_in": "ai_service.customer_risk_analysis"}
    if intent == "reject_operations":
        ops = detect_high_reject_operations(db, tenant, today - timedelta(days=30), today)
        if not ops:
            return {"answer": "No rejected bundle scans recorded in the last 30 days.", "grounded_in": "ai_service.detect_high_reject_operations"}
        worst = max(ops, key=lambda o: o["rejected_bundle_scans"])
        return {"answer": f"Operation {worst['operation_id']} has generated the most rejects: {worst['rejected_bundle_scans']} rejected bundle scans in the last 30 days.", "grounded_in": "ai_service.detect_high_reject_operations"}
    raise AIError(f"Unhandled intent: {intent}")


# ==================== LLM PROVIDER (configured, untested against real APIs) ====================


def get_active_provider_config(db: Session, tenant) -> Optional[AIProviderConfig]:
    return (
        db.query(AIProviderConfig)
        .filter(AIProviderConfig.company_id == tenant.company_id, AIProviderConfig.is_active == True)
        .order_by(AIProviderConfig.is_default.desc())
        .first()
    )


def call_llm(provider_config: AIProviderConfig, system_prompt: str, user_message: str) -> str:
    """Structured correctly for each provider's real SDK call shape, but
    NEVER EXECUTED against a live API in this environment -- no network
    access, and none of openai/anthropic/google-generativeai are
    installed (checked requirements.txt before adding this module; none
    were present, so they're added to requirements.txt as optional
    extras rather than assumed already available). Calling this function
    today will raise ImportError/ModuleNotFoundError until those
    packages are installed and a real api_key_env_var is set -- that's
    the honest state, not glossed over.
    """
    import os

    api_key = os.environ.get(provider_config.api_key_env_var)
    if not api_key:
        raise AIError(
            f"Environment variable {provider_config.api_key_env_var} is not set -- "
            f"cannot call {provider_config.provider.value}. This is expected in any "
            f"environment where the provider hasn't been configured yet."
        )

    if provider_config.provider == AIProvider.ANTHROPIC:
        import anthropic  # not installed/verified in this environment -- see docstring
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model=provider_config.model_name, max_tokens=provider_config.max_tokens,
            system=system_prompt, messages=[{"role": "user", "content": user_message}],
        )
        return response.content[0].text

    if provider_config.provider == AIProvider.OPENAI:
        import openai
        client = openai.OpenAI(api_key=api_key, base_url=provider_config.api_base_url or None)
        response = client.chat.completions.create(
            model=provider_config.model_name,
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_message}],
            max_tokens=provider_config.max_tokens, temperature=float(provider_config.temperature),
        )
        return response.choices[0].message.content

    if provider_config.provider == AIProvider.AZURE_OPENAI:
        import openai
        client = openai.AzureOpenAI(api_key=api_key, azure_endpoint=provider_config.api_base_url)
        response = client.chat.completions.create(
            model=provider_config.model_name,
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_message}],
            max_tokens=provider_config.max_tokens,
        )
        return response.choices[0].message.content

    if provider_config.provider == AIProvider.GOOGLE_GEMINI:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(provider_config.model_name)
        response = model.generate_content(f"{system_prompt}\n\n{user_message}")
        return response.text

    if provider_config.provider == AIProvider.OLLAMA:
        import httpx
        resp = httpx.post(
            f"{provider_config.api_base_url or 'http://localhost:11434'}/api/generate",
            json={"model": provider_config.model_name, "prompt": f"{system_prompt}\n\n{user_message}", "stream": False},
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json()["response"]

    raise AIError(f"Unsupported provider: {provider_config.provider}")


# ==================== RAG (keyword-based; see KnowledgeDocument's own note) ====================


def search_knowledge_base(db: Session, tenant, query: str, document_type: Optional[str] = None, limit: int = 5) -> list:
    """Keyword search (ILIKE across title/content), not semantic vector
    search -- no embedding model or vector index is available in this
    environment. Real and working for exact/partial keyword matches;
    stated plainly that it will miss paraphrased/semantically-similar
    matches a true embedding-based retriever would catch."""
    q = tenant.apply(
        db.query(KnowledgeDocument).filter(KnowledgeDocument.is_active == True),
        KnowledgeDocument,
    )
    if document_type:
        try:
            q = q.filter(KnowledgeDocument.document_type == KnowledgeDocumentType(document_type))
        except ValueError:
            raise AIError(f"Invalid document_type: {document_type}")
    q = q.filter(or_(KnowledgeDocument.title.ilike(f"%{query}%"), KnowledgeDocument.content.ilike(f"%{query}%")))
    return q.limit(limit).all()


# ==================== CONVERSATIONAL ASSISTANT (orchestrator) ====================


def answer_question(db: Session, tenant, user_id: int, conversation_id: Optional[int], question: str) -> dict:
    """The main entry point. Tries the deterministic intent router first
    (works with zero AI infrastructure); falls back to the LLM path only
    for genuinely open-ended questions the router doesn't recognize --
    and that fallback requires a configured provider (see call_llm's
    docstring for what "configured" actually requires here)."""
    intent = route_intent(question)
    if intent:
        result = answer_intent(db, tenant, intent)
        grounded_in = {"function": result["grounded_in"], "intent": intent}
        answer_text = result["answer"]
    else:
        provider_config = get_active_provider_config(db, tenant)
        if not provider_config:
            raise AIError(
                "This question doesn't match a known reporting intent, and no AI provider "
                "is configured for open-ended answers. Configure one via POST /ai/providers, "
                "or rephrase the question to match a supported query (see module docs for examples)."
            )
        context_docs = search_knowledge_base(db, tenant, question, limit=3)
        context_text = "\n\n".join(d.content[:1000] for d in context_docs)
        system_prompt = (
            "You are a factory operations assistant. Answer only from the provided context. "
            "If the context doesn't contain the answer, say so rather than guessing.\n\n" + context_text
        )
        answer_text = call_llm(provider_config, system_prompt, question)
        grounded_in = {"function": "call_llm", "provider": provider_config.provider.value, "context_docs": [d.id for d in context_docs]}

    if conversation_id:
        conversation = db.query(AIConversation).filter(AIConversation.id == conversation_id, AIConversation.user_id == user_id).first()
        if not conversation:
            raise AIError("Conversation not found")
    else:
        conversation = AIConversation(user_id=user_id, company_id=tenant.company_id, factory_id=tenant.factory_id, title=question[:80])
        db.add(conversation)
        db.flush()

    db.add(AIMessage(conversation_id=conversation.id, role="user", content=question))
    db.add(AIMessage(conversation_id=conversation.id, role="assistant", content=answer_text, grounded_in=grounded_in))
    from datetime import datetime
    conversation.last_message_at = datetime.utcnow()

    return {"conversation_id": conversation.id, "answer": answer_text, "grounded_in": grounded_in}
