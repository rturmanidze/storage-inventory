from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.auth import decode_token
from app.routers import (
    audit,
    auth,
    dashboard,
    import_data,
    issued_to,
    items,
    locations,
    movements,
    notifications,
    reports,
    scan,
    units,
    users,
    warehouses,
)
from app.websocket import manager as ws_manager

app = FastAPI(title="Storage Inventory API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_routers = [
    auth.router,
    items.router,
    warehouses.router,
    locations.router,
    units.router,
    movements.router,
    issued_to.router,
    dashboard.router,
    scan.router,
    import_data.router,
    users.router,
    audit.router,
    reports.router,
    notifications.router,
]

for router in _routers:
    app.include_router(router, prefix="/api")


@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = ""):
    """Authenticated WebSocket endpoint for real-time events.

    Clients connect with: ws://<host>/api/ws?token=<jwt>
    """
    payload = decode_token(token) if token else None
    user_id: int = int(payload["sub"]) if payload else 0

    await ws_manager.connect(websocket, user_id)
    try:
        while True:
            # Keep the connection alive; client messages are ignored
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, user_id)

