"""
Single entry point for minting barcode/QR identities.

Design (see GARMENT-ERP-ARCHITECTURE.md section 1.3):
  - `code` (human-readable, e.g. "EMP00042") already exists on each master.
  - `barcode_value` is what's physically encoded in the Code128 barcode.
  - `qr_value` is what's encoded in the QR (usually a richer/prefixed string
    so a generic QR scanner app can disambiguate entity type on scan).

Called ONCE at entity creation. Never regenerated — if it were, printed
labels already stuck on machines/bundles/rolls would silently stop
resolving to the right row.
"""

from typing import Tuple

# Prefixes let scan_service (module 8) resolve a scanned code to the right
# table without a full-table fan-out lookup across every scannable entity.
ENTITY_PREFIXES = {
    "employee": "EMP",
    "machine": "MCH",
    "fabric_roll": "FRL",
    "lot": "LOT",
    "bundle": "BND",
    "quality_check": "QLT",
    "packing_list": "PKG",
    "warehouse": "WH",
}


def generate_for(entity_type: str, code: str, entity_id: int) -> Tuple[str, str]:
    """Returns (barcode_value, qr_value) for a newly created entity.

    barcode_value: {PREFIX}-{code} — kept short, Code128-friendly.
    qr_value: {PREFIX}-{code}-{id} — includes the numeric id so scan_service
    can do an O(1) primary-key lookup instead of a barcode_value string scan.
    """
    if entity_type not in ENTITY_PREFIXES:
        raise ValueError(f"Unknown scannable entity type: {entity_type}")

    prefix = ENTITY_PREFIXES[entity_type]
    barcode_value = f"{prefix}-{code}"
    qr_value = f"{prefix}-{code}-{entity_id}"
    return barcode_value, qr_value


def resolve_prefix(scanned_value: str) -> str:
    """Given a scanned barcode/QR string, return which entity type it
    belongs to. Used by scan_service before it queries a specific table."""
    prefix = scanned_value.split("-")[0].upper()
    for entity_type, p in ENTITY_PREFIXES.items():
        if p == prefix:
            return entity_type
    raise ValueError(f"Unrecognized barcode prefix in: {scanned_value}")
