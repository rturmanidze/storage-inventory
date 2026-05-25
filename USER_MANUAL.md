# Storage Inventory — Confluence Manual (Team Version)

> Copy this page into Confluence as your main team guide.
> Audience: operations, shufflers, shift managers, and admins.

## 1) What this system does

Storage Inventory tracks the full casino card lifecycle:

- deck stock in warehouse,
- packing structure (**Deck → Box → Container → Shoe**),
- studio movement (send/return),
- shredding and physical destruction,
- audit history and reporting.

The goal is that every important action is visible, traceable, and role-controlled.

## 2) How to access

Use:

- `https://localhost:8085` (same machine), or
- `https://<server-ip>:8085` (LAN)

Sign in with your assigned account.
If token expires, you will be redirected to login automatically.

## 3) Roles (who can do what)

- **ADMIN**: full access (users, backups, all operations)
- **OPERATIONS_MANAGER**: full operational workflows
- **SHIFT_MANAGER**: daily shoe/container/card workflows
- **SHUFFLER**: send/return/shred/refill flows
- **MANAGER / VIEWER**: legacy roles

If a button/page is missing, your role does not include that permission.

## 4) System map (pages and purpose)

### Core operational pages

- **Dashboard**: real-time summary, low-stock alerts, forecast
- **Deck Inventory**: add deck stock by color/material
- **Boxes**: view standard boxes and create spare boxes
- **Containers**: lock/unlock/rename/archive containers and adjust counts
- **Shoes**: create, send, return, shred, refill, report physical damage
- **Destroyed Shoes**: shredded and physically destroyed history, recover/replace
- **Studios**: manage studio destinations

### Governance & data pages

- **Import**: bulk upload via CSV/XLSX
- **Reports**: analytics + CSV exports
- **Audit Log**: searchable action history
- **Users** (admin): account and role management
- **Backups** (admin): create/download/restore/delete backups

## 5) What happens in daily operations

### A. Start of shift

1. Open **Dashboard** and check low-stock/critical alerts.
2. If needed, add decks in **Deck Inventory**.
3. Confirm containers required for operations are **unlocked**.

### B. Shoe lifecycle (normal)

1. **Create Shoe** (consumes required deck stock).
2. **Send to Studio** when deployed.
3. **Return from Studio** when cycle ends.
4. Decide next action:
   - shred cards, then recover shoe container, or
   - refill for next cycle.

### C. If cards are shredded

- Shoe cards are destroyed and action is logged.
- Shoe container can be recovered as empty and reused.
- History is visible in **Destroyed Shoes** and **Audit Log**.

### D. If shoe is physically destroyed

- Mark physical destruction in **Shoes**.
- Use **Replace Shoe** from **Destroyed Shoes** to create new one with same display number.
- Replacement consumes new deck stock.

## 6) Inventory logic teammates should know

- Locked containers are part of **total physical stock** but not **available stock**.
- Dashboard/Deck pages highlight low stock so action can be taken early.
- Every critical lifecycle event is auditable (who, what, when).

## 7) Import formats (quick reference)

Accepted files: `.csv`, `.xlsx`, `.xls`

- **Items**: `sku, name, category, unit, minStock, description`
- **Locations**: `warehouseCode, code, description`
- **Barcodes**: `sku, barcode, symbology`
- **Units**: `sku, serial, status`
- **Placements**: `serial, warehouseCode, locationCode`

Import results show success count and row-level errors.

## 8) Backups and restore (admin only)

- Automatic backup runs daily (02:00 UTC).
- Manual backup can be created from **Backups** page.
- Restore fully replaces current DB data (destructive operation).
- Always verify the target file before restore.

## 9) Recommended team routine

Use this short checklist in Confluence for every shift:

1. Check Dashboard alerts
2. Verify available deck stock and unlocked containers
3. Run shoe send/return workflow
4. Process shredded/destroyed shoe records
5. Review Audit Log for anomalies
6. Export Reports when needed

## 10) Troubleshooting

- **Cannot log in / redirected to login**: token expired or invalid; sign in again.
- **Action unavailable**: account role does not permit it.
- **Import failed**: fix row format shown in error details and re-upload.
- **Numbers look stale**: refresh page and confirm API availability (`https://<host>:3010/api`).
