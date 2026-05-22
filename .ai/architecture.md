# Urban Pulse — Architecture

## What this project is

Urban Pulse is a real-time city intelligence platform built for Marrakech, Morocco.
It collects sensor data, visualizes it on a live map, forecasts future values, detects anomalies,
and explains patterns through AI. It also exposes a public developer API for external access.

Audience: city operators, hackathon judges, urban researchers.

---

## System diagram

```
┌──────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                     │
│  localhost:3000  │  Vercel (production)                  │
│                                                          │
│  app/         →  App Router pages (SSR + client)        │
│  components/  →  Client components, maps, charts        │
│  lib/         →  API client, auth, theme, MapLibre      │
│  workers/     →  Web Workers (IDW interpolation)        │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTP / WebSocket
                       ▼
┌──────────────────────────────────────────────────────────┐
│              FastAPI Backend (Python 3.12)                │
│  localhost:8000  │  Railway (production)                 │
│                                                          │
│  /api/v1/*    →  Main REST API (JWT auth)               │
│  /public/v1/* →  Developer API (X-API-Key auth)         │
│  /internal/*  →  Internal endpoints (INTERNAL_SECRET)   │
│  /ws/*        →  WebSocket (alerts, sensor updates)     │
│  /metrics     →  Prometheus scrape endpoint             │
└──────┬──────────────┬──────────────┬────────────────────┘
       │              │              │
       ▼              ▼              ▼
┌──────────┐  ┌──────────┐  ┌──────────────┐
│TimescaleDB│  │  Redis   │  │   RabbitMQ   │
│ (PG 16)  │  │          │  │              │
│          │  │ latest/  │  │ sensor_data  │
│ sensors  │  │ alerts/  │  │ exchange     │
│ readings │  │ forecast │  │ → worker     │
│ alerts   │  │ city_kpi │  │ alerts queue │
└──────────┘  └──────────┘  └──────┬───────┘
                                   │
                         ┌─────────┴──────────┐
                         ▼                    ▼
                ┌────────────────┐  ┌────────────────┐
                │   Simulator    │  │     Worker     │
                │  (Python)      │  │  (Python)      │
                │                │  │                │
                │ generator.py   │  │ consumes queue │
                │ → RabbitMQ     │  │ → TimescaleDB  │
                │                │  │ → Redis latest │
                │                │  │ → alerts       │
                └────────────────┘  └────────────────┘
```

---

## Repository layout

```
/
├── .ai/                        # AI coding context (this folder)
├── .github/workflows/          # CI/CD + seed cron
├── apps/
│   ├── api/                    # FastAPI backend
│   │   └── app/
│   │       ├── api/v1/endpoints/   # Handlers by domain
│   │       ├── core/               # Dependencies, Redis, WS, MinIO
│   │       ├── routers/            # Maps, forecast, intelligence, chatbot
│   │       └── scripts/seed.py     # Schema + metric seed
│   ├── web/                    # Next.js 14 frontend
│   │   └── src/
│   │       ├── app/            # App Router pages
│   │       ├── components/     # Shared React components
│   │       ├── lib/            # api.ts, auth, theme, map-layers, map-styles
│   │       └── workers/        # IDW Web Worker
│   ├── simulator/              # Synthetic sensor data generator
│   └── worker/                 # RabbitMQ consumer → DB writer
├── packages/
│   ├── shared/                 # Config, enums, Pydantic schemas
│   ├── database/               # SQLAlchemy models + migrations
│   ├── auth/                   # JWT + RBAC (smart_city_auth)
│   └── observability/          # Logging setup
├── docker-compose.yml
├── seed_historical.py          # 90-day historical data seeder
└── SETUP.md
```

---

## Database schema (core tables)

| Table | PK | Key fields |
|---|---|---|
| `sensors` | `id` (string) | name, type, lat, lng, status |
| `metric_definitions` | `id` (UUID) | key (unique), display_name, unit, category, min, max, thresholds_json |
| `sensor_readings` | (`time`, `sensor_id`, `metric_id`) | value — TimescaleDB hypertable |
| `alerts` | `id` (UUID) | sensor_id, severity, message, acknowledged |
| `anomaly_events` | `id` (UUID) | sensor_id, metric_id, z_score, method, time |
| `users` | `id` (UUID) | email, password_hash, role, plan |
| `api_keys` | `id` (UUID) | user_id, key_hash, tier, allowed_metrics |

---

## Data flows

| Flow | Path |
|---|---|
| **Live** | Simulator → RabbitMQ → Worker → TimescaleDB + Redis latest |
| **API read** | Client → FastAPI → Redis cache hit OR TimescaleDB query |
| **Alerts** | Worker (threshold check) → RabbitMQ + Redis pub/sub → WebSocket → Client |
| **AI** | Client → FastAPI → Groq (Llama 3) → JSON response → Client |
| **Seeding** | GitHub Actions cron → `/internal/seed-latest` (INTERNAL_SECRET) → TimescaleDB |
| **Anomaly** | Worker reads rolling window → Z-score + IQR → `anomaly_events` + alert queue |

---

## Key architectural principles

- Business logic stays in the API — the frontend is display only
- Redis is the source of truth for *current* values; TimescaleDB for *historical*
- Never hardcode metric keys or category strings — always read from DB or `MetricCategory` enum
- MapLibre GeoJSON layers over DOM Markers — performance at scale
- All MapLibre components are dynamically imported with `ssr: false`
- New metrics must be registered in all 9 locations listed in `rules.md`

---

## Common failure modes

- **422 from API:** Pydantic schema doesn't match request body — check field names and types
- **MapLibre layer not appearing:** Source was added after the layer, or style not loaded yet — add layer in the `map.on('load')` callback
- **WebSocket not reconnecting:** Check exponential backoff logic in the WS client hook
- **Forecast missing:** Prophet requires at least 2 data points — ensure historical seed ran first
- **Redis cache stale:** TTL may be too long — check the `ex=` param on `redis.set()` calls
- **RabbitMQ connection refused:** Worker started before RabbitMQ was healthy — check `depends_on` + healthcheck in docker-compose