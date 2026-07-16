# Module 18 — AI Production Intelligence Platform

## Lesson from Modules 14–17, applied one final time

Checked for `ai.py`, `chat.py`, `assistant.py`, `insights.py` in
endpoints and any related router registration before writing anything.
None existed — clean territory, confirmed first.

## Architecture Review

**The central architectural rule — "AI reads, ERP writes" — is enforced
by construction, not just documented, and was verified mechanically, not
asserted.** Grepping `ai_service.py` for every `db.add(` call shows
exactly three: one `AIConversation` and two `AIMessage` rows, both
inside `answer_question()`. Nothing else in the file calls `db.add()` or
mutates a business table (`Bundle`, `Lot`, `StockBalance`, `SalarySlip`,
etc.). If an analysis function's result implies an action, the response
is a plain string or a list of flagged records — carrying out the action
means the user calls the normal existing endpoint
(`employee_work_service.issue_bundle()` via `/employee-work/issue`,
etc.), never a path through this module.

**Two categories of function, kept honestly distinct:**

1. **Rule-based analysis — real, working, no LLM required.** Every
   function under Production/Quality/Inventory/Payroll/Costing/Sales/
   Machine analysis is pure aggregation or threshold logic over
   functions already built in modules 6–17 (`report_service`,
   `dashboard_service`, `machine_service`, `quality_service`,
   `payroll_service`, `costing_service`, `sales_service`). Verified
   mechanically: 22 cross-service calls checked against real function
   definitions, all resolve. These are blocked from actual execution
   only by "no live database," the same limitation as every other module
   this session — not by "no AI provider."
2. **LLM-backed functions — structured, genuinely untested.** `call_llm()`
   has real, correctly-shaped calls for each of the 5 required providers
   (OpenAI, Anthropic, Gemini, Azure OpenAI, Ollama), but none of the
   three required SDKs (`openai`, `anthropic`, `google-generativeai`)
   were installed or callable in this environment (no network, checked
   `requirements.txt` before starting — none were present, so they're
   added as explicit new dependencies, not assumed already available).
   Calling this function today raises `ImportError` or `AIError` until a
   real key and package are in place. Stated in the function's own
   docstring, not just here.

**The deterministic intent router is the load-bearing design decision
of this module.** Every example question in the spec ("How many bundles
are running?", "Which employee produced the highest output today?",
etc.) is answered by `route_intent()` + `answer_intent()` — pure pattern
matching plus a real data lookup, **zero LLM calls**. Free-form questions
that don't match fall back to the LLM+RAG path, which requires a
configured provider. This means the assistant is useful today, in an
environment with no AI infrastructure configured at all — verified by a
dedicated test (`test_answer_question_works_without_any_provider_for_recognized_question`).

## AI Review

**RAG is real but scoped honestly.** `search_knowledge_base()` does
keyword matching (`ILIKE` across title/content) — genuinely working for
exact/partial matches, not a placeholder. It will **not** catch
semantically-similar paraphrases a true embedding-based retriever would
(e.g. searching "fire" won't necessarily surface a document about
"combustion hazards" unless that word also appears). `KnowledgeDocument`
has no embedding column and there's no vector index — stated in the
model's own docstring as a "phase 1," with true vector search named as a
stated future upgrade requiring pgvector plus an embedding provider,
neither of which exists in this schema or environment.

**Forecasting is a labeled trailing average, not a claimed ML model.**
`forecast_fabric_consumption()` computes a 30-day moving average and
linearly extrapolates it — the function's own return payload includes
`"method": "30-day trailing average, linearly extrapolated -- not a
trained forecasting model"`. Same honesty pattern for
`breakdown_risk_estimate()` (flags above-average breakdown frequency, not
a trained failure-prediction model) — both are useful, real signals, but
not what "AI-predicted" usually implies, and the code says so.

## Security & Permission Review

- **Provider config storage**: `AIProviderConfig.api_key_env_var` stores
  an **environment variable name**, never the raw API key — the same
  pattern this project already uses for `DATABASE_URL`/JWT secrets in
  `core/config.py`. A raw key in a regular database column readable by
  any query would be a real credential-exposure risk; this avoids it by
  construction.
- **Role-based access reuses existing role groups**, not a new
  permission model: payroll/costing insights are gated to the same
  `SENSITIVE_VIEW`-equivalent roles established in modules 12/12.5;
  chat itself is open to a broader role set since individual questions
  are answered from data the underlying service functions already scope
  correctly (e.g. a worker asking "how many bundles are running" gets
  the same tenant-scoped `dashboard_service` answer a manager would).
- **Conversations are scoped to `user_id`** — `get_conversation_messages()`
  checks `AIConversation.user_id == current_user.id` before returning
  anything, so one user can't read another's chat history via a guessed
  conversation ID.
- **Every legitimate answer is traceable**: `AIMessage.grounded_in`
  records exactly which function (and, for LLM answers, which knowledge
  documents) produced the response — a reviewer can verify the assistant
  didn't fabricate a number, rather than trusting it silently.

## Verification Report

| Category | Status |
|---|---|
| ✅ Static Verification | 107/107 tables have exactly one migration; every cross-service call in `ai_service.py` (22 calls across 7 services) mechanically verified against real function definitions, including return-shape spot-checks beyond name-existence |
| ✅ Syntax Verification | All 104 backend files pass `ast.parse` |
| ✅ Architecture Verification | The "AI reads, ERP writes" rule verified mechanically (grep for every `db.add()` call) rather than only documented; deterministic router confirmed to require zero AI infrastructure |
| ⏳ Runtime Verification | **Pending** — no live PostgreSQL; LLM-backed functions additionally require real provider API keys and network access, neither available here |
| ⏳ Integration Verification | **Pending** |
| ⏳ Production Validation | **Pending** — explicitly "until executed with real AI providers and production data," per the module's own requirement |

Unit tests: `tests/test_ai_service.py` — 16 tests, including one that
mechanically re-derives the "never writes to business tables" guarantee
from the source code itself (not just asserting it), and one confirming
the assistant works end-to-end with zero AI provider configured for a
recognized question — written and syntax-verified, **never executed**.

## Migration

`0021_ai_production_intelligence.py` — 2 new enums, 4 new tables
(`ai_provider_configs`, `ai_conversations`, `ai_messages`,
`knowledge_documents`). No existing table was touched.

---

## This closes Module 18, the last module in the planned sequence

Every module from 9 through 18 was built under the same discipline:
static/syntax/architecture verification only (no live database in this
environment), mechanical cross-reference of every cross-service call
(catching several real bugs before they shipped — GRN field-name
mismatches in module 16, a genuinely duplicate GST calculation caught
and removed in module 14), and an explicit check for pre-existing files
before writing anything (after the module-14 mistake of overwriting a
real 910-line `reports.py`, caught and disclosed rather than hidden).
Runtime, integration, and production validation remain honestly
**Pending** across all ten modules until executed against a real
PostgreSQL instance — per the migration validation harness built earlier
in this session, which is what should run first, before any of these
modules is treated as production-ready.
