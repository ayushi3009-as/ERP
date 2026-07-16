"""
Single writer for stock movements (StockBalance + StockLedger).

Originally lived as private helpers inside inventory.py. Extracted here the
moment a second consumer (fabric_rolls.py) needed the same logic — per the
"no duplicate models, no duplicate work" architecture principle, this is
meant to be the one place StockBalance/StockLedger get written from
anywhere in the app.

CORRECTED as part of the final go-live inventory blocker resolution:
inventory.py and purchase.py were never actually consolidated onto this
function — they kept their own inline copies, which is how this file's
math was allowed to drift from what the app actually needed. Mapping
every one of those call sites (not a blind refactor) surfaced FOUR real
divergences, fixed here:

1. Weighted-average cost was not maintained at all on incoming stock —
   inventory.py's/purchase.py's own inline code computed it correctly;
   this function silently left avg_cost stale. Fixed: post_stock_movement
   now recomputes avg_cost on every incoming movement, matching the
   formula both call sites already used.
2. OUT movements were never checked against reserved_quantity — a caller
   could oversell already-reserved stock. Fixed: raises StockError if
   requested quantity exceeds (quantity - reserved_quantity).
3. TRANSFER had no correct semantics here at all — the old code's
   `else` branch (catch-all for anything but OUT/ADJUSTMENT) would ADD
   on both sides of a transfer, which is only correct for the
   destination, not the source. Fixed: a dedicated transfer_stock()
   function does an explicit OUT-equivalent on the source warehouse and
   an IN-equivalent (with weighted-average cost carried over) on the
   destination — two balances, two ledger rows, correctly signed.
4. Physical stock count/verification needs to SET an absolute quantity
   and record the signed difference in the ledger — fundamentally
   different from every other movement type, which is always a delta.
   Fixed: a dedicated set_physical_count() function, not overloaded onto
   post_stock_movement's delta semantics.

purchase.py's GRN stock-update additionally had a severe, separate bug:
its own local _get_or_create_balance()/StockLedger() never received a
`tenant` at all, so newly-created StockBalance/StockLedger rows had no
company_id/factory_id — a NOT NULL violation waiting to happen (or,
if it somehow didn't fail, invisible/orphaned stock data). Routing GRN
receipt through this module's tenant-aware functions fixes that too.
"""

from typing import Optional
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

from app.models.models import StockBalance, StockLedger, StockMovementType


class StockError(ValueError):
    pass


def get_or_create_balance(
    db: Session,
    tenant: "TenantContext",  # noqa: F821 - avoids circular import, duck-typed
    product_id: int,
    warehouse_id: int,
    color_id: Optional[int] = None,
    size_id: Optional[int] = None,
    batch_number: Optional[str] = None,
) -> StockBalance:
    balance = (
        tenant.apply(db.query(StockBalance), StockBalance)
        .filter(
            StockBalance.product_id == product_id,
            StockBalance.warehouse_id == warehouse_id,
            (StockBalance.color_id == color_id)
            if color_id
            else (StockBalance.color_id.is_(None)),
            (StockBalance.size_id == size_id)
            if size_id
            else (StockBalance.size_id.is_(None)),
            (StockBalance.batch_number == batch_number)
            if batch_number
            else (StockBalance.batch_number.is_(None)),
        )
        .first()
    )
    if not balance:
        balance = StockBalance(
            company_id=tenant.company_id,
            factory_id=tenant.factory_id,
            product_id=product_id,
            warehouse_id=warehouse_id,
            color_id=color_id,
            size_id=size_id,
            batch_number=batch_number,
            quantity=0,
            reserved_quantity=0,
            damaged_quantity=0,
            avg_cost=0,
        )
        db.add(balance)
        db.flush()
    return balance


def _apply_weighted_average_cost(balance: StockBalance, incoming_qty: Decimal, incoming_unit_cost: Decimal) -> None:
    """The exact formula inventory.py's stock-in and purchase.py's GRN
    receipt both already computed inline before this fix — reproduced
    here once, not copied a third time."""
    old_qty = balance.quantity
    new_qty = old_qty + incoming_qty
    if old_qty == 0 and balance.avg_cost == 0:
        balance.avg_cost = incoming_unit_cost
    elif new_qty > 0:
        old_total = balance.avg_cost * old_qty
        incoming_total = incoming_unit_cost * incoming_qty
        balance.avg_cost = (old_total + incoming_total) / new_qty
    # if new_qty <= 0 (shouldn't happen on an incoming movement), leave
    # avg_cost as-is rather than divide by zero/negative


def post_stock_movement(
    db: Session,
    tenant: "TenantContext",  # noqa: F821
    product_id: int,
    warehouse_id: int,
    movement_type: StockMovementType,
    quantity: float,
    unit_cost: float = 0,
    batch_number: Optional[str] = None,
    lot_number: Optional[str] = None,
    roll_number: Optional[str] = None,
    color_id: Optional[int] = None,
    size_id: Optional[int] = None,
    reference_type: Optional[str] = None,
    reference_id: Optional[int] = None,
    reference_number: Optional[str] = None,
    remarks: Optional[str] = None,
    check_reserved: bool = True,
) -> StockLedger:
    """Writes one StockLedger row AND updates the matching StockBalance in
    the same call — the two are never allowed to drift apart because
    nothing outside this module is allowed to touch either table.

    NOT for TRANSFER (use transfer_stock()) or physical-count corrections
    (use set_physical_count()) — both have semantics this generic
    delta-based function can't correctly express; see module docstring.
    """
    if movement_type == StockMovementType.TRANSFER:
        raise StockError("Use transfer_stock() for TRANSFER movements, not post_stock_movement()")

    balance = get_or_create_balance(
        db, tenant, product_id, warehouse_id, color_id, size_id, batch_number
    )

    signed_qty = Decimal(str(quantity))
    unit_cost_dec = Decimal(str(unit_cost))

    if movement_type == StockMovementType.OUT:
        available = balance.quantity - balance.reserved_quantity
        if check_reserved and signed_qty > available:
            raise StockError(
                f"Insufficient available stock for product {product_id} at warehouse {warehouse_id}: "
                f"available {available} (on hand {balance.quantity} minus {balance.reserved_quantity} reserved), "
                f"requested {signed_qty}"
            )
        balance.quantity = balance.quantity - signed_qty
    elif movement_type == StockMovementType.ADJUSTMENT:
        # caller passes the signed delta directly for adjustments; a
        # positive delta is incoming stock and re-averages cost the same
        # as any other incoming movement, a negative delta does not
        # (there's no new cost basis when stock is found to be missing).
        if signed_qty > 0:
            _apply_weighted_average_cost(balance, signed_qty, unit_cost_dec)
        balance.quantity = balance.quantity + signed_qty
    else:  # IN
        _apply_weighted_average_cost(balance, signed_qty, unit_cost_dec)
        balance.quantity = balance.quantity + signed_qty

    balance.last_movement_date = func.now()

    total_cost = signed_qty * unit_cost_dec
    entry = StockLedger(
        company_id=tenant.company_id,
        factory_id=tenant.factory_id,
        product_id=product_id,
        warehouse_id=warehouse_id,
        movement_type=movement_type,
        quantity=signed_qty,
        unit_cost=unit_cost_dec,
        total_cost=total_cost,
        running_balance=balance.quantity,
        batch_number=batch_number,
        lot_number=lot_number,
        roll_number=roll_number,
        color_id=color_id,
        size_id=size_id,
        reference_type=reference_type,
        reference_id=reference_id,
        reference_number=reference_number,
        remarks=remarks,
    )
    db.add(entry)
    db.flush()
    return entry


def transfer_stock(
    db: Session,
    tenant: "TenantContext",  # noqa: F821
    product_id: int,
    from_warehouse_id: int,
    to_warehouse_id: int,
    quantity: float,
    color_id: Optional[int] = None,
    size_id: Optional[int] = None,
    batch_number: Optional[str] = None,
    reference_type: Optional[str] = None,
    reference_id: Optional[int] = None,
    remarks: Optional[str] = None,
    check_reserved: bool = True,
) -> tuple:
    """The real semantics inventory.py's inline transfer logic already
    had (source decremented, destination re-averaged at the source's
    current cost) — reproduced here as the single correct implementation
    instead of a third inline copy. Returns (source_ledger_entry,
    destination_ledger_entry)."""
    if quantity <= 0:
        raise StockError("Transfer quantity must be positive")

    from_balance = get_or_create_balance(db, tenant, product_id, from_warehouse_id, color_id, size_id, batch_number)
    signed_qty = Decimal(str(quantity))
    available = from_balance.quantity - from_balance.reserved_quantity
    if check_reserved and signed_qty > available:
        raise StockError(
            f"Insufficient available stock to transfer: available {available}, requested {signed_qty}"
        )

    unit_cost = from_balance.avg_cost  # the cost basis moves with the stock
    from_balance.quantity = from_balance.quantity - signed_qty
    from_balance.last_movement_date = func.now()

    from_entry = StockLedger(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        product_id=product_id, warehouse_id=from_warehouse_id,
        movement_type=StockMovementType.TRANSFER, quantity=signed_qty,
        unit_cost=unit_cost, total_cost=signed_qty * unit_cost,
        running_balance=from_balance.quantity,
        batch_number=batch_number, color_id=color_id, size_id=size_id,
        reference_type=reference_type, reference_id=reference_id,
        remarks=f"Transfer to warehouse {to_warehouse_id}. {remarks or ''}".strip(),
    )
    db.add(from_entry)

    to_balance = get_or_create_balance(db, tenant, product_id, to_warehouse_id, color_id, size_id, batch_number)
    _apply_weighted_average_cost(to_balance, signed_qty, unit_cost)
    to_balance.quantity = to_balance.quantity + signed_qty
    to_balance.last_movement_date = func.now()

    to_entry = StockLedger(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        product_id=product_id, warehouse_id=to_warehouse_id,
        movement_type=StockMovementType.TRANSFER, quantity=signed_qty,
        unit_cost=unit_cost, total_cost=signed_qty * unit_cost,
        running_balance=to_balance.quantity,
        batch_number=batch_number, color_id=color_id, size_id=size_id,
        reference_type=reference_type, reference_id=reference_id,
        remarks=f"Transfer from warehouse {from_warehouse_id}. {remarks or ''}".strip(),
    )
    db.add(to_entry)
    db.flush()
    return from_entry, to_entry


def set_physical_count(
    db: Session,
    tenant: "TenantContext",  # noqa: F821
    product_id: int,
    warehouse_id: int,
    physical_quantity: float,
    color_id: Optional[int] = None,
    size_id: Optional[int] = None,
    batch_number: Optional[str] = None,
    reference_type: Optional[str] = None,
    reference_id: Optional[int] = None,
    remarks: Optional[str] = None,
) -> Optional[StockLedger]:
    """Physical stock count / verification: SETS the balance to the
    counted quantity (not a delta) and records the signed difference as
    an ADJUSTMENT ledger entry -- the one case where "how much changed"
    and "what the new total is" are reported separately, matching what
    inventory.py's stock-count endpoint already did inline. Returns None
    if the count matched (no discrepancy, nothing to record)."""
    balance = get_or_create_balance(db, tenant, product_id, warehouse_id, color_id, size_id, batch_number)
    diff = Decimal(str(physical_quantity)) - balance.quantity
    if abs(diff) <= Decimal("0.001"):
        return None

    balance.quantity = Decimal(str(physical_quantity))
    balance.last_movement_date = func.now()

    entry = StockLedger(
        company_id=tenant.company_id, factory_id=tenant.factory_id,
        product_id=product_id, warehouse_id=warehouse_id,
        movement_type=StockMovementType.ADJUSTMENT, quantity=diff,
        unit_cost=balance.avg_cost, total_cost=diff * balance.avg_cost,
        running_balance=balance.quantity,
        batch_number=batch_number, color_id=color_id, size_id=size_id,
        reference_type=reference_type, reference_id=reference_id,
        remarks=remarks or f"Physical count verification: {'found ' + str(diff) + ' more' if diff > 0 else 'found ' + str(abs(diff)) + ' less'}",
    )
    db.add(entry)
    db.flush()
    return entry
