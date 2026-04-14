# Storage Inventory

A **multi-warehouse storage inventory** web application with barcode/serial-number tracking,
built with NestJS + Prisma + React and packaged as Docker containers.  
Runs on **Windows Server** via Docker Compose and is accessible from any device on the local network.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| API | Node.js + NestJS + Prisma ORM |
| Database | PostgreSQL 16 |
| Web UI | React 18 + Vite + Tailwind CSS |
| Web Server | Nginx (serves static React build) |
| Containers | Docker + Docker Compose |

---

## Features

- **Role-based auth** – admin / manager / viewer
- **Multiple warehouses** with locations/bins
- **Item (SKU) management** with multiple barcodes per item
- **Serial-number tracking** – globally unique serials, status tracking
- **Movements**: Receive, Transfer, Issue (with issued-to), Return
- **Barcode scanning** – USB keyboard-wedge scanners and phone camera (html5-qrcode)
- **Import** – bulk import via CSV or Excel (.xlsx) with per-row error reporting
- **Audit trail** – every movement records who created it and when

---

## Prerequisites (Windows Server)

1. **Docker Desktop** (recommended) or Docker Engine + Docker Compose plugin.  
   Download: <https://docs.docker.com/desktop/install/windows-install/>
2. Git (optional – to clone the repository).

---

## Quick start

### 1. Clone the repository

```cmd
git clone https://github.com/rturmanidze/storage-inventory.git
cd storage-inventory
```

### 2. Configure environment variables

Copy the example env file and edit the passwords:

```cmd
copy .env.example .env
```

Open `.env` in a text editor and change at minimum:

```
POSTGRES_PASSWORD=your_secure_db_password
JWT_SECRET=your_very_long_random_secret_string_here
```

### 3. Build and start

```cmd
docker compose up --build -d
```

This will:
- Pull the PostgreSQL 16 image
- Build the NestJS API image
- Build the React web UI image (Nginx)
- Start all three containers
- Apply database migrations and seed an initial admin user

### 4. Access the application

| URL | Description |
|-----|-------------|
| `http://localhost:10080` | Web UI (same machine) |
| `http://<server-ip>:10080` | Web UI (other LAN devices) |
| `http://localhost:3000/api` | REST API |

### 5. Default credentials

| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin123` | ADMIN |

> **Change the admin password after first login** (edit the user via the API or DB).

---

## Stopping and restarting

```cmd
# Stop containers (data is preserved)
docker compose down

# Stop and wipe the database volume
docker compose down -v

# Restart after changes
docker compose up --build -d
```

---

## Data persistence

PostgreSQL data is stored in a Docker named volume (`db_data`).  
It survives container restarts and image rebuilds.

---

## Import format

### Items CSV/XLSX
| sku | name | category | unit | minStock |
|-----|------|----------|------|----------|

### Locations CSV/XLSX
| warehouseName | code | description |
|---------------|------|-------------|

### Barcodes CSV/XLSX
| sku | barcode |
|-----|---------|

### Serialized Units CSV/XLSX
| sku | serial |
|-----|--------|

### Placements CSV/XLSX (initial stock placement)
| serial | locationCode | warehouseName |
|--------|-------------|---------------|

---

## Repository structure

```
.
├── api/                # NestJS application
│   ├── src/
│   ├── prisma/         # Prisma schema + seed
│   └── Dockerfile
├── web/                # React application
│   ├── src/
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Development (local, without Docker)

### API

```cmd
cd api
npm install
# Copy and configure env
copy .env.example .env
# Edit DATABASE_URL to point to your local Postgres
npx prisma migrate dev
npx prisma db seed
npm run start:dev
```

### Web

```cmd
cd web
npm install
npm run dev
```

The Vite dev server proxies `/api` to `http://localhost:3000`.

