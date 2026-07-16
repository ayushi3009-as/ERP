"""
Shared fabric-roll issue/return logic.

fabric_rolls.py's own /issue and /return endpoints call this, and so does
Lot's fabric-issue endpoint (module 4) — the over-issue validation and
balance/status math must only exist in one place.
"""

from typing import Optional
from decimal import Decimal
from sqlalchemy.orm import Session

from app.models.models import (
    FabricRoll,
    FabricRollMovement,
    FabricRollStatus,
    Fabric,
    StockMovementType,
)
from app.services import stock_service, realtime_service


def _record_movement(
    db: Session,
    roll: FabricRoll,
    movement_type: str,
    quantity_meters: float,
    balance_after: float,
    employee_id: Optional[int] = None,
    from_warehouse_id: Optional[int] = None,
    to_warehouse_id: Optional[int] = None,
    reference_type: Optional[str] = None,
    reference_id: Optional[int] = None,
    remarks: Optional[str] = None,
    created_by: Optional[int] = None,
) -> FabricRollMovement:
    mv = FabricRollMovement(
        fabric_roll_id=roll.id,
        movement_type=movement_type,
        quantity_meters=Decimal(str(quantity_meters)),
        from_warehouse_id=from_warehouse_id,
        to_warehouse_id=to_warehouse_id,
        reference_type=reference_type,
        reference_id=reference_id,
        employee_id=employee_id,
        balance_after=Decimal(str(balance_after)),
        remarks=remarks,
        created_by=created_by,
    )
    db.add(mv)
    return mv


def issue_from_roll(
    db: Session,
    tenant: "TenantContext",  # noqa: F821
    roll: FabricRoll,
    quantity_meters: float,
    actor_user_id: int,
    employee_id: Optional[int] = None,
    reference_type: Optional[str] = None,
    reference_id: Optional[int] = None,
    remarks: Optional[str] = None,
) -> FabricRollMovement:
    if roll.status in (FabricRollStatus.REJECTED, FabricRollStatus.CLOSED):
        raise ValueError(f"Cannot issue from a roll with status '{roll.status.value}'")
    if quantity_meters <= 0:
        raise ValueError("quantity_meters must be positive")
    if Decimal(str(quantity_meters)) > roll.balance_length_meters:
        raise ValueError(
            f"Cannot issue {quantity_meters}m — only "
            f"{roll.balance_length_meters}m available on roll {roll.roll_number}"
        )

    roll.balance_length_meters = roll.balance_length_meters - Decimal(str(quantity_meters))
    roll.issued_by = employee_id
    roll.updated_by = actor_user_id
    roll.status = (
        FabricRollStatus.FULLY_CONSUMED
        if roll.balance_length_meters <= 0
        else FabricRollStatus.PARTIALLY_USED
        if roll.balance_length_meters < roll.roll_length_meters
        else FabricRollStatus.ISSUED_TO_CUTTING
    )

    mv = _record_movement(
        db,
        roll,
        movement_type="issue",
        quantity_meters=quantity_meters,
        balance_after=float(roll.balance_length_meters),
        employee_id=employee_id,
        from_warehouse_id=roll.warehouse_id,
        reference_type=reference_type or "manual",
        reference_id=reference_id,
        remarks=remarks,
        created_by=actor_user_id,
    )

    fabric = db.query(Fabric).filter(Fabric.id == roll.fabric_id).first()
    if fabric and fabric.product_id:
        stock_service.post_stock_movement(
            db,
            tenant,
            product_id=fabric.product_id,
            warehouse_id=roll.warehouse_id,
            movement_type=StockMovementType.OUT,
            quantity=quantity_meters,
            color_id=roll.color_id,
            roll_number=roll.roll_number,
            lot_number=roll.dye_lot_number,
            reference_type=reference_type or "fabric_roll_issue",
            reference_id=reference_id or roll.id,
            reference_number=roll.roll_number,
            remarks=remarks or "Fabric roll issue",
        )

    realtime_service.emit(
        db,
        tenant.company_id,
        tenant.factory_id,
        event_type="fabric_roll_issued",
        entity_type="fabric_roll",
        entity_id=roll.id,
        payload={
            "quantity_meters": quantity_meters,
            "balance_after": float(roll.balance_length_meters),
            "status": roll.status.value,
        },
    )
    return mv


def return_to_roll(
    db: Session,
    tenant: "TenantContext",  # noqa: F821
    roll: FabricRoll,
    quantity_meters: float,
    actor_user_id: int,
    employee_id: Optional[int] = None,
    reference_type: Optional[str] = None,
    reference_id: Optional[int] = None,
    remarks: Optional[str] = None,
) -> FabricRollMovement:
    if quantity_meters <= 0:
        raise ValueError("quantity_meters must be positive")
    new_balance = roll.balance_length_meters + Decimal(str(quantity_meters))
    if new_balance > roll.roll_length_meters:
        raise ValueError("Return quantity would exceed the roll's original length")

    roll.balance_length_meters = new_balance
    roll.updated_by = actor_user_id
    roll.status = (
        FabricRollStatus.STORED
        if roll.balance_length_meters == roll.roll_length_meters
        else FabricRollStatus.PARTIALLY_USED
    )

    mv = _record_movement(
        db,
        roll,
        movement_type="return",
        quantity_meters=quantity_meters,
        balance_after=float(roll.balance_length_meters),
        employee_id=employee_id,
        to_warehouse_id=roll.warehouse_id,
        reference_type=reference_type or "manual",
        reference_id=reference_id,
        remarks=remarks,
        created_by=actor_user_id,
    )

    fabric = db.query(Fabric).filter(Fabric.id == roll.fabric_id).first()
    if fabric and fabric.product_id:
        stock_service.post_stock_movement(
            db,
            tenant,
            product_id=fabric.product_id,
            warehouse_id=roll.warehouse_id,
            movement_type=StockMovementType.IN,
            quantity=quantity_meters,
            color_id=roll.color_id,
            roll_number=roll.roll_number,
            lot_number=roll.dye_lot_number,
            reference_type=reference_type or "fabric_roll_return",
            reference_id=reference_id or roll.id,
            reference_number=roll.roll_number,
            remarks=remarks or "Fabric roll return",
        )

    realtime_service.emit(
        db,
        tenant.company_id,
        tenant.factory_id,
        event_type="fabric_roll_returned",
        entity_type="fabric_roll",
        entity_id=roll.id,
        payload={"balance_after": float(roll.balance_length_meters)},
    )
    return mv
