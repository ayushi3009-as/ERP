"""
Single entry point for real-time event emission.

Every service that mutates operational state (stock, bundle stage, machine
status, payroll) calls `emit()`. Persists the row (module 6) AND
broadcasts it over WebSocket (module 15) -- both in the same call, so no
caller needs to change when the broadcast side is added or altered.
"""

from typing import Optional
from sqlalchemy.orm import Session

from app.models.models import RealtimeEvent
from app.services import connection_manager


def emit(
    db: Session,
    company_id: int,
    factory_id: Optional[int],
    event_type: str,
    entity_type: str,
    entity_id: int,
    payload: Optional[dict] = None,
) -> RealtimeEvent:
    event = RealtimeEvent(
        company_id=company_id,
        factory_id=factory_id,
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=payload or {},
    )
    db.add(event)
    db.flush()

    message = {
        "event_type": event_type, "entity_type": entity_type, "entity_id": entity_id,
        "payload": payload or {}, "factory_id": factory_id, "created_at": str(event.created_at),
    }
    # Broadcast to the factory-wide dashboard topic and the entity-specific
    # topic (e.g. a bundle-detail view watching just its own updates) --
    # two topics, one event, not two separate emit paths.
    if factory_id is not None:
        connection_manager.manager.broadcast_sync(f"factory:{factory_id}", message)
    connection_manager.manager.broadcast_sync(f"{entity_type}:{entity_id}", message)

    return event
