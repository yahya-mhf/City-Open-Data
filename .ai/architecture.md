# Urban Pulse — Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                     │
│  localhost:3000  │  Vercel (production)                  │
│                                                        │
│  pages/  →  app router, server components               │
│  components/  →  Client components, maps, charts        │
│  lib/  →  API client, auth, theme, MapLibre helpers     │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTP / WebSocket
                       ▼
┌──────────────────────────────────────────────────────────┐
│              FastAPI Backend (Python 3.12)                │
│  localhost:8000  │  Railway (production)                 │
│                                                        │
│  /api/v1/*   →  Main REST API                           │
│  /public/v1/*  →  Developer API (API-key auth)          │
│  /internal/*   →  Internal endpoints (seed, health)     │
│  /ws/*        →  WebSocket (alerts, sensor updates)     │
│  /metrics     →  Prometheus                             │
└──────┬──────────────┬──────────────┬────────────────────┘
       │              │              │
       ▼              ▼              ▼
┌──────────┐  ┌──────────┐  ┌──────────────┐
│TimescaleDB│  │  Redis   │  │   RabbitMQ   │
│ (PG 16)  │  │ Cache+WS │  │  Message Bus │
│          │  │          │  │              │
│ sensors  │  │ latest/  │  │ sensor_data  │
│ readings │  │ alerts/  │  │ exchange     │
│ alerts   │  │ cache    │  │ → worker     │
└──────────┘  └──────────┘  └──────┬───────┘
                                   │
                                   ▼
                          ┌────────────────┐
                          │  Simulator     │
                          │  + Worker      │
                          │  (Python)      │
                          │                │
                          │  generator.py  │
                          │  → RabbitMQ    │
                          │  main.py       │
                          │  ← RabbitMQ    │
                          │  → TimescaleDB │
                          └────────────────┘
```

## Service Responsibilities

### Frontend (`apps/web/`)
- Next.js 14 App Router, TypeScript, Tailwind CSS
- Map rendering via MapLibre GL JS
- Charts via Recharts (Line, Bar, Area, Composed)
- State: React hooks + context (auth, theme)
- WebSocket client for live alerts
- Dynamic imports for all MapLibre components (SSR disabled)

### API Backend (`apps/api/`)
- FastAPI with async SQLAlchemy + asyncpg
- JWT auth via `smart_city_auth` package
- API key auth via middleware (`X-API-Key` header)
- Role-based access: citizen, operator, admin
- Redis caching for latest readings, forecasts, city stats
- WebSocket publisher for seismic alerts
- Groq (Llama 3) integration for AI features
- Route structure: v1 endpoints grouped by domain (sensors, alerts, maps, analytics, etc.)

### Simulator (`apps/simulator/`)
- Standalone Python process
- Generates realistic sensor readings with diurnal/noise patterns
- Publishes batches to RabbitMQ every N seconds
- Configurable via env vars: `SIMULATOR_INTERVAL_SECONDS`, `SIMULATOR_SENSOR_COUNT`, `SIMULATOR_REALISTIC_TIME`

### Worker (`apps/worker/`)
- Consumes from RabbitMQ `sensor_data` exchange
- Validates metric definitions against DB
- Stores readings in TimescaleDB hypertable
- Updates Redis with latest per-sensor values
- Checks thresholds and fires alerts
- Publishes seismic events to Redis channel for WebSocket broadcast

## Database Schema (core tables)

- `sensors` — PK: `id` (string), fields: name, type, lat, lng, status
- `metric_definitions` — PK: `id` (UUID), unique: `key`, fields: display_name, unit, category, min/max, thresholds_json
- `sensor_readings` — PK: (`time`, `sensor_id`, `metric_id`), TimescaleDB hypertable
- `alerts` — PK: `id` (UUID), FK: sensor_id, fields: severity, message, acknowledged
- `users` — PK: `id` (UUID), fields: email, password_hash, role, plan
- `api_keys` — PK: `id` (UUID), FK: user_id, fields: key_hash, tier, allowed_metrics

## Data Flow

1. **Live path:** Simulator → RabbitMQ → Worker → TimescaleDB + Redis latest
2. **API path:** Client → FastAPI → (Redis cache hit) | (TimescaleDB query)
3. **Alert path:** Worker (threshold check) → RabbitMQ alerts queue + Redis pub/sub → WebSocket → Client
4. **AI path:** Client → FastAPI → Groq API → structured JSON response → Client
5. **Seed path:** GitHub Actions → `/internal/seed-latest` → FastAPI inserts batch → TimescaleDB
