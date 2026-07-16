"""
WebSocket connection manager for the Factory Command Center (module 15).

Genuinely new infrastructure -- nothing in this codebase had a WebSocket
transport before this module. realtime_service.emit() already wrote
RealtimeEvent rows (module 6); this file is what finally pushes those
events to connected browsers instead of requiring polling.

Scope boundary, stated plainly: this is an IN-PROCESS connection
registry. It broadcasts correctly to every WebSocket connected to THIS
server process. It does NOT broadcast across multiple worker processes
or machines -- a multi-worker production deployment needs Redis pub/sub
(already a project dependency, per requirements.txt) as the fan-out
layer between processes, which is not wired here. Untested against a
running server in this environment (no network/live process available),
consistent with every other piece of this session's work.
"""

import asyncio
import json
from typing import Dict, List, Optional
from fastapi import WebSocket

# Captured once at app startup (see main.py) so emit() -- which runs in a
# worker thread when called from a sync endpoint -- can safely schedule
# a send back onto the event loop that owns the WebSocket connections.
_main_event_loop: Optional[asyncio.AbstractEventLoop] = None


def set_main_event_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _main_event_loop
    _main_event_loop = loop


class ConnectionManager:
    def __init__(self):
        self._connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, topic: str) -> None:
        await websocket.accept()
        self._connections.setdefault(topic, []).append(websocket)

    def disconnect(self, websocket: WebSocket, topic: str) -> None:
        if topic in self._connections and websocket in self._connections[topic]:
            self._connections[topic].remove(websocket)

    async def broadcast_async(self, topic: str, message: dict) -> None:
        dead = []
        for ws in self._connections.get(topic, []):
            try:
                await ws.send_text(json.dumps(message, default=str))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, topic)

    def broadcast_sync(self, topic: str, message: dict) -> None:
        """Called from realtime_service.emit(), which runs in a sync
        context (plain SQLAlchemy Session, no async DB layer in this
        project). Schedules the actual async send onto the captured main
        event loop rather than trying to await directly from sync code."""
        if _main_event_loop is None:
            return  # no event loop captured yet (e.g. during tests) -- no-op, not an error
        try:
            asyncio.run_coroutine_threadsafe(self.broadcast_async(topic, message), _main_event_loop)
        except RuntimeError:
            pass  # event loop not running (e.g. shutting down) -- drop the broadcast, don't crash the caller


manager = ConnectionManager()
