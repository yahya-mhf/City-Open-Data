# Urban Pulse — Smart City Monitoring Platform

A production-ready environmental monitoring platform for Marrakech. Sensors deployed across the city stream real-time data through RabbitMQ to a FastAPI backend, where it is stored in TimescaleDB, cached in Redis, and served via REST + WebSocket to a Next.js dashboard with AI-powered intelligence features.

## Features

- **Real-time Sensor Ingestion** — RabbitMQ pipeline stores readings in TimescaleDB hypertables with automatic downsampling
- **Live Dashboard** — Map-based UI with clustered sensor markers, thematic heatmaps (IDW interpolation), and per-sensor detail pages
- **AI Intelligence** — Groq-powered daily briefing (Llama 3), anomaly detection (rolling Z-score + IQR), Prophet forecasting with multi-regressor correlation
- **City Health Scorecard** — Composite AQI, Heat Stress Index (Rothfusz regression), and Urban Livability Score computed every 5 minutes
- **What-if Simulator** — Adjust sensor metric values and see projected impact on the dashboard
- **Split-screen Map Comparison** — View two metrics side-by-side with synchronized viewport
- **Data Export** — CSV, JSON, and GeoJSON export with API key rate limits (free/pro/enterprise tiers)
- **Citizen Reports** — Public report submission with map-based visualization and status tracking
- **Correlation Analytics** — Pearson correlation heatmap across all metrics
- **Anomaly Detection** — Real-time rolling Z-score + IQR outlier detection with RabbitMQ alert publishing
- **Dark Mode** — Full night-mode across all pages with persistent preference

## Tech Stack

| Component | Technology |
|-----------|-----------|
| API | Python 3.12, FastAPI, SQLAlchemy 2.0 (async), Alembic |
| Worker | Python 3.12, aio-pika (async RabbitMQ consumer) |
| Simulator | Python 3.12, generates realistic sensor data |
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Maplibre GL JS, Recharts |
| Database | PostgreSQL 16 + TimescaleDB 2.x (hypertables, continuous aggregates) |
| Cache | Redis 7 (latest values, forecast caching, rate limits) |
| Messaging | RabbitMQ 3 (topic exchange, dead-letter queue, persistent delivery) |
| Storage | MinIO (S3-compatible object storage for report images) |
| Monitoring | Prometheus + Grafana (custom dashboards per service) |
| AI/ML | Groq API (Llama 3 for briefing), Prophet (multi-regressor forecasting) |
| Auth | JWT (access + refresh tokens), Argon2 password hashing, RBAC (operator/admin) |
| Packaging | Poetry (all Python packages), npm (frontend) |
| CI/CD | GitHub Actions (lint + test + Docker build + Railway deploy) |

## Architecture

```
Sensors → Hubs → RabbitMQ (topic exchange)
                    ↓
              Worker (consumer)
                    ↓
          ┌── TimescaleDB (historical)
          ├── Redis (latest values)
          ├── RabbitMQ alerts queue
          │
          ↓
      API Server (FastAPI)
          ↓
    ┌── Web Frontend (Next.js)
    ├── WebSocket (live updates)
    └── REST API (/api/v1/…)
```

## Project Structure

```
urban-pulse/
├── apps/
│   ├── api/              FastAPI application (routers, endpoints, core logic)
│   ├── worker/           RabbitMQ consumer (validate, store, detect anomalies)
│   ├── web/              Next.js frontend (App Router, components, pages)
│   └── simulator/        Synthetic sensor data generator
├── packages/
│   ├── shared/           Pydantic schemas, enums, constants
│   ├── database/         SQLAlchemy ORM models, Alembic migrations
│   ├── auth/             JWT handler, Argon2 hashing, RBAC dependencies
│   └── observability/    Structured logging, Prometheus metrics
├── infrastructure/
│   ├── nginx/            Reverse proxy configuration
│   ├── prometheus/       Scrape config and alerting rules
│   └── grafana/          Provisioned dashboards and datasources
├── .github/workflows/    CI (lint + test + build) + CD (Railway) + seed-live
├── docker-compose.yml    Full stack orchestration
└── railway.json          Railway deployment config
```

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for frontend development)
- Python 3.12 + Poetry (for backend development)
- A Groq API key for AI features (optional)

### Run with Docker (recommended)

```bash
# Clone and enter the project
git clone <repo-url> && cd sc

# Copy environment file
cp .env.example .env
# Edit .env to set GROQ_API_KEY and other secrets

# Start all services
docker compose up -d

# Frontend: http://localhost:3000
# API:      http://localhost:8000/docs
# Grafana:  http://localhost:3001 (admin/admin)
# MinIO:    http://localhost:9001
```

### Run without Docker (development)

```bash
# Start infrastructure dependencies
docker compose up -d timescaledb redis rabbitmq minio

# Install and start API
cd apps/api && poetry install && poetry run uvicorn app.main:app --reload

# Install and start Worker (separate terminal)
cd apps/worker && poetry install && poetry run python app/main.py

# Install and start Simulator (separate terminal)
cd apps/simulator && poetry install && poetry run python app/main.py

# Install and start Frontend (separate terminal)
cd apps/web && npm install && npm run dev

# Seed demo data
curl -X POST http://localhost:8000/internal/seed-latest \
  -H "INTERNAL_SECRET: your-internal-secret-here"
```

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/sensors` | List all sensors |
| GET | `/api/v1/sensors/{id}` | Sensor details |
| GET | `/api/v1/sensors/{id}/latest` | Latest readings |
| GET | `/api/v1/sensors/{id}/history` | Historical readings |
| GET | `/api/v1/sensors/{id}/stats` | Monthly statistics |
| GET | `/api/v1/sensors/{id}/heatmap` | 24h heatmap grid |
| GET | `/api/v1/sensors/{id}/distribution` | Histogram buckets |
| POST | `/api/v1/sensors/{id}/simulate` | What-if scenario |
| GET | `/api/v1/alerts` | List alerts |
| GET | `/api/v1/maps/metrics` | Available metrics |
| GET | `/api/v1/maps/layers/{key}` | Sensor layer data |
| GET | `/api/v1/maps/layers/{key}/forecast` | Prophet forecast |
| GET | `/api/v1/analytics/correlations` | Pearson correlation matrix |
| GET | `/api/v1/city-health` | AQI, Heat Stress, Livability |
| GET | `/api/v1/intelligence/briefing` | AI daily briefing |
| GET | `/api/v1/anomalies` | Detected anomalies |
| GET | `/api/v1/reports/public` | Public citizen reports |
| POST | `/api/v1/auth/register` | User registration |
| POST | `/api/v1/auth/login` | Authentication |
| GET | `/api/v1/export/preview` | Export record estimate |
| GET | `/api/v1/export/sensors` | Data export (CSV/JSON/GeoJSON) |

## Key Design Decisions

- **TimescaleDB hypertables** for time-series sensor readings with automatic continuous aggregates (`sensor_readings_hourly`)
- **Topic exchange routing** enables selective consumer subscription (raw data, alerts, invalid messages)
- **Rolling Z-score + IQR** dual-pass anomaly detection; alert fired to RabbitMQ only when both methods agree
- **Rolling Prophet** retrains forecast on last 14 days per sensor; extra regressors selected by Pearson correlation > 0.3
- **City health** computed server-side from hourly aggregates, cached 5 minutes in Redis
- **Briefing** generated by Groq (Llama 3) from last 24h of data, cached 6 hours
- **Rate limits** for export enforced per API key per user per day (free: 1k, pro: 100k, enterprise: unlimited)

## API Key Tiers

| Tier | Daily Export Limit | History |
|------|-------------------|---------|
| Free | 1,000 rows | 24 hours |
| Pro  | 100,000 rows | 7 days |
| Enterprise | Unlimited | Full |

## Environment Variables

See [.env.example](.env.example) for a complete reference with descriptions.

## License

MIT
