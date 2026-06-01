"""WebSocket connection manager for real-time broadcasts."""
import asyncio
import json
from typing import Dict, List

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        # user_id -> list of WebSocket connections (supports multiple tabs)
        self._connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: int) -> None:
        await websocket.accept()
        self._connections.setdefault(user_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: int) -> None:
        conns = self._connections.get(user_id, [])
        if websocket in conns:
            conns.remove(websocket)
        if not conns:
            self._connections.pop(user_id, None)

    async def broadcast(self, message: dict) -> None:
        """Send a message to every connected client."""
        data = json.dumps(message)
        dead: list[tuple[int, WebSocket]] = []
        for uid, conns in list(self._connections.items()):
            for ws in list(conns):
                try:
                    await ws.send_text(data)
                except Exception:
                    dead.append((uid, ws))
        for uid, ws in dead:
            self.disconnect(ws, uid)

    async def send_to_user(self, user_id: int, message: dict) -> None:
        """Send a message to a specific user across all their connections."""
        data = json.dumps(message)
        dead: list[WebSocket] = []
        for ws in list(self._connections.get(user_id, [])):
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, user_id)


manager = ConnectionManager()
