# Storage Inventory — User Manual

This manual explains how to use the **Storage Inventory** web application for card/deck/shoe operations, reporting, and administration.

## 1. Access and Login

1. Open the web UI:
   - `https://localhost:8085` (same machine), or
   - `https://<server-ip>:8085` (same network).
2. Sign in with your username and password.
3. Use **Sign out** from the left sidebar footer when finished.

## 2. User Roles

Available roles:

- **ADMIN** — full access (users, backups, all operations)
- **OPERATIONS_MANAGER** — full operational access (no full admin credential tasks)
- **SHIFT_MANAGER** — shoe/container/card workflow operations
- **SHUFFLER** — shuffle flow (send/return/shred/refill)
- **MANAGER / VIEWER** — legacy roles used in older flows

If you cannot see a page or action button, your current role does not have permission.

## 3. Main Navigation

### Overview
- **Dashboard**: live totals, low-stock warnings, and forecast.

### Card Operations
- **Studios**: create and manage studio destinations.
- **Deck Inventory**: add decks (black/red, plastic/paper), watch low-stock alerts.
- **Boxes**: view standard boxes and create spare boxes.
- **Containers**: create/lock/unlock/rename/archive containers, adjust remaining decks.
- **Shoes**: create shoes, send/return, shred cards, refill, mark physical damage.
- **Destroyed Shoes**: track shredded/physically destroyed shoes, recover or replace.

### Data / Analytics / Settings
- **Import**: bulk import items, locations, barcodes, units, placements from CSV/XLSX.
- **Reports**: inventory analytics and CSV exports.
- **Audit Log**: searchable activity log.
- **Users** (admin): create/edit/delete users and roles.
- **Backups** (admin): create, download, restore, and delete database backups.

## 4. Standard Daily Workflow

1. **Check Dashboard** for low-stock or critical alerts.
2. **Add Decks** in Deck Inventory when stock is low.
3. **Review Containers** and unlock any needed stock.
4. **Create/Manage Shoes**:
   - create shoe,
   - send to studio,
   - return from studio,
   - shred cards when needed,
   - recover empty shoe or replace physically destroyed shoe.
5. **Review Destroyed Shoes** for history and replacement/recovery actions.
6. **Use Reports/Audit** for operational review and traceability.

## 5. Import Data

Import page accepts `.csv`, `.xlsx`, `.xls` and reports per-row errors.

Expected columns:

- **Items**: `sku, name, category, unit, minStock, description`
- **Locations**: `warehouseCode, code, description`
- **Barcodes**: `sku, barcode, symbology`
- **Units**: `sku, serial, status`
- **Placements**: `serial, warehouseCode, locationCode`

## 6. Backups and Restore (Admin)

- Automatic backups run daily (02:00 UTC).
- You can create on-demand backups from **Backups**.
- **Restore is destructive**: it fully replaces current database data.
- Download backup files before major changes for extra safety.

## 7. Helpful Notes

- Locked containers are counted in total physical stock but not available stock.
- Destroyed-shoe and shredding actions are intentionally audited and visible in history.
- Use Reports + Audit Log together for compliance and investigation.

## 8. Troubleshooting

- **Cannot login / unexpected redirect to login**: session token may be expired; sign in again.
- **Action button missing**: verify your assigned role.
- **Import errors**: fix the row format shown in error details and re-upload.
- **No data updates**: refresh page or verify API (`https://<host>:3010/api`) is reachable.
