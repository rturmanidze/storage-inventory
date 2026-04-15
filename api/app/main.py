from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, dashboard, import_data, issued_to, items, locations, movements, scan, units, warehouses

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
]

for router in _routers:
    app.include_router(router, prefix="/api")
