# Urban Pulse — Setup & Configuration Guide

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) for Windows/macOS or Docker Engine on Linux
- [Node.js](https://nodejs.org/) 18+ (for frontend, runs on host)
- [Git](https://git-scm.com/)
- A [Groq](https://console.groq.com) API key (free tier: 30 req/min)
- (Optional) A GitHub account to use the seed-live workflow

---

## Quick Start

### 1. Clone and configure

```bash
git clone https://github.com/yahya-mhf/City-Open-Data.git
cd City-Open-Data
```

Copy the example env file and fill in your secrets:

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
# Required — get from https://console.groq.com
GROQ_API_KEY=gsk_your_key_here

# Optional — change if you want a different internal seed secret
INTERNAL_SECRET=pick-a-random-string
```

### 2. Start the infrastructure (Docker)

```bash
docker compose up -d timescaledb redis rabbitmq minio
```

This starts PostgreSQL/TimescaleDB, Redis, RabbitMQ, and MinIO. Wait ~30s for them to become healthy.

### 3. Build API image (first time only)

```bash
docker compose build api
```

If Docker build fails on Windows (network issues), use the fallback:

```bash
# Use the pre-built image with bind mounts instead
docker compose pull api  # or use any Python 3.12-slim image
```

### 4. Start API

```bash
docker compose up -d api
```

The API auto-installs `openai` and `watchfiles` on startup, then starts with `--reload` for hot code reload.

### 5. Seed the database

```bash
# Insert metric definitions and initial sensors
docker exec sc-api-1 poetry run python -m app.scripts.seed

# Seed 90 days of historical sensor readings (~4.6M rows, takes ~10 min)
# Copy the script first (done once per container restart):
docker cp seed_historical.py sc-api-1:/app/seed_historical.py
docker exec sc-api-1 python /app/seed_historical.py --days 90
```

### 6. Install frontend dependencies and start

```bash
cd apps/web
npm install
npm run dev
```

The frontend runs on `http://localhost:3000`.

### 7. Verify

- Frontend: http://localhost:3000
- API health: http://localhost:8000/health
- API docs: http://localhost:8000/docs

---

## Environment Variables Reference

### `.env` (root — used by Docker Compose)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | `postgresql+asyncpg://sc_user:sc_password@timescaledb:5432/smart_city` | TimescaleDB connection string |
| `REDIS_URL` | Yes | `redis://redis:6379/0` | Redis connection string |
| `RABBITMQ_URL` | Yes | `amqp://guest:guest@rabbitmq:5672/` | RabbitMQ connection string |
| `MINIO_ENDPOINT` | Yes | `minio:9000` | MinIO S3-compatible storage endpoint |
| `MINIO_ACCESS_KEY` | Yes | `sc_access_key` | MinIO access key |
| `MINIO_SECRET_KEY` | Yes | `sc_secret_key` | MinIO secret key |
| `MINIO_BUCKET` | Yes | `smart-city` | MinIO bucket name |
| `JWT_SECRET` | Yes | `super-secret-key-change-in-production` | JWT signing secret (change in production!) |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | No | `30` | JWT access token lifetime |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | No | `7` | JWT refresh token lifetime |
| `CORS_ORIGINS` | No | `http://localhost:3000,http://localhost` | Comma-separated allowed CORS origins |
| `ENVIRONMENT` | No | `development` | Environment name |
| `LOG_LEVEL` | No | `INFO` | Python logging level |
| `API_HOST` | No | `0.0.0.0` | API bind address |
| `API_PORT` | No | `8000` | API port |
| `GROQ_API_KEY` | **YES** | — | Groq API key for AI features (chatbot, intelligence, briefing) |
| `INTERNAL_SECRET` | Yes | `change-me-in-production` | Shared secret for the `/internal/*` endpoints |

### `apps/web/.env.local` (frontend — create this file)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:8000/api/v1` | Backend API base URL |
| `NEXT_PUBLIC_WS_URL` | No | `ws://localhost:8000/ws` | WebSocket base URL |
| `API_INTERNAL_URL` | No | `http://localhost:8000/api/v1` | Internal API URL for server-side fetching (SSR metadata) |

---

## Manual Configuration Steps

### 1. Groq API Key (REQUIRED for AI features)

Get a free API key from https://console.groq.com/keys, then set it in `.env`:

```env
GROQ_API_KEY=gsk_your_key_here
```

**Required for:** Pulse AI chatbot, city intelligence analysis, daily AI briefing, scenario simulator.

### 2. Docker Image (Windows workaround)

If `docker compose build api` fails on Windows with network timeouts:

```bash
pip install poetry
cd apps/api && poetry install
```

Then change the API service in `docker-compose.yml` to use the host Python instead (not recommended) OR keep rebuilding until it succeeds. The `command: ["sh", "-c", "pip install -q openai watchfiles && poetry run uvicorn ..."]` workaround in `docker-compose.yml` ensures openai is available even with the stale image.

### 3. Historical Data Seed

After starting the API container, run the historical seed:

```bash
docker cp seed_historical.py sc-api-1:/app/seed_historical.py
docker exec sc-api-1 python /app/seed_historical.py --days 90
```

This inserts ~4.6M rows across 12 metric types for all 30 sensors (takes 5–15 minutes). If you want less data, use `--days 14` instead.

### 4. GitHub Actions Seed Workflow

The `.github/workflows/seed-live.yml` runs every hour and calls `POST /internal/seed-latest`. To use it:

1. Go to your repo's **Settings → Secrets and variables → Actions**
2. Add a **repository secret** `INTERNAL_SECRET` matching your `.env` value
3. Add a **repository variable** `API_URL` set to your deployed API URL (e.g. `https://your-api.railway.app`)
4. The workflow triggers automatically on the cron schedule or via manual `workflow_dispatch`

### 5. Simulator (optional live data)

To run the live sensor simulator that publishes readings via RabbitMQ:

```bash
docker compose up -d worker
docker compose up -d simulator
```

The simulator generates readings every 5 seconds for 20 virtual sensors and publishes them via RabbitMQ. The worker consumes, validates, and stores them in TimescaleDB.

### 6. Seismic Alert WebSocket

The seismic alert system is automatic:
- The worker monitors incoming readings for `seismic` values > 2.5 Richter
- It publishes to the Redis `seismic_events` channel
- The API WebSocket handler broadcasts to connected frontend clients
- The frontend `SeismicAlertWrapper` shows a full-screen modal

No manual config needed beyond having `seismic` metric definitions and running the worker.

### 7. Daily AI Briefing (cron job)

The Morning Briefing is generated by calling Groq (Llama 3) with the last 24 hours of sensor data. To enable it, you need:

1. A cron job (e.g., GitHub Actions scheduled at 06:00 Morocco time) that calls `POST /api/v1/intelligence/briefing`
2. The result is cached in Redis for 6 hours
3. The frontend landing page displays it via the briefing card

*Note: The briefing endpoint needs to be implemented — the landing page currently shows example text as a placeholder.*

### 8. Login Credentials (after seed)

| Email | Password | Role |
|---|---|---|
| `admin@smartcity.com` | `admin123` | Admin (Enterprise) |
| `citizen@smartcity.com` | `citizen123` | Citizen (Free) |
| `pro@smartcity.com` | `pro123` | Citizen (Pro) |

---

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Frontend   │────▶│   FastAPI    │────▶│ TimescaleDB │
│  Next.js    │     │   Backend    │     │ (PostgreSQL)│
│  local:3000 │◀────│  local:8000  │◀────│             │
└─────────────┘     └──────┬───────┘     └─────────────┘
                           │
                    ┌──────┴───────┐     ┌─────────────┐
                    │   RabbitMQ   │◀────│  Simulator  │
                    │              │────▶│   Worker    │
                    └──────┬───────┘     └─────────────┘
                           │
                    ┌──────┴───────┐
                    │    Redis     │
                    │ (cache + WS) │
                    └──────────────┘
```

---

## Troubleshooting

**API container crashes with `ModuleNotFoundError: No module named 'openai'`**
→ The container command should auto-install it (`pip install -q openai watchfiles`). If not, run manually: `docker exec sc-api-1 pip install openai watchfiles`

**Frontend shows blank map tiles**
→ MapLibre uses OpenStreetMap raster tiles by default. Ensure the frontend can reach `tile.openstreetmap.org` (no VPN blocking).

**CORS errors from frontend**
→ Ensure `CORS_ORIGINS=http://localhost:3000` is set in `.env` and the API container was recreated after changing it: `docker compose up -d --force-recreate api`

**Seed script is slow**
→ The `BATCH_SIZE` is set to 100,000. For 90 days × 30 sensors × 12 metrics = 4.6M rows, expect 5–15 minutes. Reduce with `--days 14` for faster testing.

**WebSocket connection failed**
→ Verify `NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws` in the frontend `.env.local`. The WebSocket endpoint is at `/ws/alerts` (for seismic alerts) and `/ws/sensors` (for sensor updates).
