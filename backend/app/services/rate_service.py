"""
Rate resolution as a plain function.

rates.py's /resolve endpoint delegates here, and so does scan_service
(module 6) and payroll_service (module 12) -- the lookup order must only
exist in one place.
"""

from typing import Optional
from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models.models import OperationRate

# Dimensions payroll's Rate Master can match on, beyond operation_id
# (which is always required). Order doesn't affect the algorithm -- score
# is just "how many of the caller's provided dimensions does this row
# also specify" -- but listing them here is the single source of truth
# for which columns participate in matching.
MATCH_DIMENSIONS = [
    "style_id", "design_id", "employee_grade", "department_id",
    "machine_id", "size_id", "product_id", "customer_id",
]


def resolve_rate(
    db: Session,
    tenant: "TenantContext",  # noqa: F821
    operation_id: int,
    style_id: Optional[int] = None,
    as_of: Optional[date] = None,
    **dimensions,
) -> Optional[OperationRate]:
    """Most-specific-match-wins across every dimension in MATCH_DIMENSIONS
    (plus the always-required operation_id). A candidate row qualifies
    only if every non-null dimension IT specifies matches what the caller
    passed -- a row with machine_id=5 never applies to a scan on machine 7,
    even if every other dimension matches. Among qualifying rows, the one
    specifying the MOST dimensions wins (most specific); ties broken by
    most recent effective_from.

    Backward compatible: callers that only pass operation_id/style_id
    (the original 2-dimension signature) get identical behavior to
    before -- this is a generalization, not a behavior change for
    existing callers.
    """
    as_of = as_of or date.today()
    if style_id is not None:
        dimensions.setdefault("style_id", style_id)

    candidates = (
        tenant.apply(
            db.query(OperationRate).filter(
                OperationRate.operation_id == operation_id,
                OperationRate.is_deleted == False,
                OperationRate.effective_from <= as_of,
                or_(
                    OperationRate.effective_to.is_(None),
                    OperationRate.effective_to >= as_of,
                ),
            ),
            OperationRate,
        )
        .order_by(OperationRate.effective_from.desc())
        .all()
    )

    best = None
    best_score = -1
    for row in candidates:
        score = 0
        disqualified = False
        for dim in MATCH_DIMENSIONS:
            row_value = getattr(row, dim)
            provided_value = dimensions.get(dim)
            if row_value is None:
                continue  # wildcard on this dimension, doesn't disqualify or score
            if provided_value is not None and row_value == provided_value:
                score += 1
            else:
                disqualified = True
                break
        if disqualified:
            continue
        if score > best_score:
            best = row
            best_score = score

    return best
