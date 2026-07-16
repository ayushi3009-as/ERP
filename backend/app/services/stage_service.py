"""
Single source of truth for the production stage sequence.

Extracted from production.py's STAGE_ORDER/_get_next_stage so scan_service
(module 6) advances a bundle's stage identically to the manual
move_bundle_stage endpoint — one stage order, not two.
"""

from typing import Optional

from app.models.models import ProductionStage

STAGE_ORDER = [
    ProductionStage.PLANNING,
    ProductionStage.CUTTING,
    ProductionStage.BUNDLE,
    ProductionStage.PRINTING,
    ProductionStage.EMBROIDERY,
    ProductionStage.STITCHING,
    ProductionStage.CHECKING,
    ProductionStage.IRONING,
    ProductionStage.PACKING,
    ProductionStage.FINISHED,
    ProductionStage.DISPATCH,
]


def get_next_stage(current_stage: ProductionStage) -> Optional[ProductionStage]:
    try:
        idx = STAGE_ORDER.index(current_stage)
        if idx + 1 < len(STAGE_ORDER):
            return STAGE_ORDER[idx + 1]
    except ValueError:
        pass
    return None
