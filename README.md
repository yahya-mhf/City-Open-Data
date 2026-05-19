# Smart City Monitoring Platform

A production-ready environmental monitoring platform that collects sensor data, stores it in TimescaleDB, caches latest values in Redis, and provides APIs and a web dashboard for visualization.

## Architecture

```
Sensors → Hubs → RabbitMQ → Worker → TimescaleDB (historical)
                                   → Redis (latest cache)
                                       → API Server (REST + WebSocket)
                                           → Web Frontend
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| API | Python 3.12, FastAPI, SQLAlchemy 2.0 |
| Worker | Python 3.12, aio-pika |
| Frontend | Next.js 15, React, TypeScript, Tailwind CSS, Leaflet |
| Database | PostgreSQL + TimescaleDB |
| Cache | Redis |
| Messaging | RabbitMQ |
| Storage | MinIO (S3-compatible) |
| Monitoring | Prometheus, Grafana |

## Project Structure

```
smart-city-platform/
├── apps/
│   ├── api/            # FastAPI REST + WebSocket server
│   ├── worker/         # RabbitMQ consumer
│   ├── web/            # Next.js frontend
│   └── simulator/      # Sensor data simulator
├── packages/
│   ├── shared/         # Pydantic schemas, enums, constants
│   ├── database/       # SQLAlchemy models, Alembic migrations
│   ├── auth/           # JWT, Argon2 hashing, RBAC
│   └── observability/  # Logging, Prometheus metrics
├── infrastructure/
│   ├── docker-compose.yml
│   ├── nginx/
│   ├── prometheus/
│   └── grafana/
└── docs/
```

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Make

### Run the full stack

```bash
docker compose up --build
```

This starts all services:
- **API**: http://localhost:8000
- **Web**: http://localhost:3000
- **RabbitMQ UI**: http://localhost:15672 (guest/guest)
- **MinIO Console**: http://localhost:9001
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin)

### Seed the database

```bash
docker compose exec api poetry run python -m app.scripts.seed
```

Default credentials after seeding:
- Admin: admin@smartcity.com / admin123
- Citizen: citizen@smartcity.com / citizen123

## API Documentation

Once running, visit http://localhost:8000/docs for the interactive OpenAPI docs.

### Key Endpoints

#### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh token
- `POST /api/v1/auth/logout` - Logout
- `GET /api/v1/auth/me` - Get current user

#### Sensors
- `GET /api/v1/sensors` - List all sensors
- `GET /api/v1/sensors/{id}` - Get sensor details
- `GET /api/v1/sensors/{id}/latest` - Get latest readings (from Redis)
- `GET /api/v1/sensors/{id}/history` - Get historical readings

#### Alerts
- `GET /api/v1/alerts` - List alerts
- `POST /api/v1/alerts/{id}/acknowledge` - Acknowledge alert

#### Reports
- `POST /api/v1/reports` - Submit citizen report
- `GET /api/v1/reports/me` - Get my reports
- `GET /api/v1/reports` - List all reports (operator+)
- `PATCH /api/v1/reports/{id}` - Update report status

#### Metrics (Dynamic)
- `POST /api/v1/metrics` - Create metric definition (admin)
- `GET /api/v1/metrics` - List metric definitions
- `PATCH /api/v1/metrics/{id}` - Update metric (admin)
- `DELETE /api/v1/metrics/{id}` - Delete metric (admin)

#### Map
- `GET /api/v1/map/markers` - Get sensor markers with latest data

### WebSocket Endpoints
- `ws://localhost:8000/ws/sensors` - Real-time sensor updates
- `ws://localhost:8000/ws/alerts` - Real-time alerts
- `ws://localhost:8000/ws/reports` - Real-time report updates

## Development

### Setup

```bash
make install-dev    # Install all dependencies
make up            # Start all services
make migrations    # Run database migrations
make seed          # Seed initial data
```

### Testing

```bash
make test          # Run all Python tests
```

### Code Quality

```bash
make lint          # Run Ruff linter
make format        # Format code with Ruff
```

## Dynamic Metrics

Admins can create new metrics on the fly without code changes:

```bash
curl -X POST http://localhost:8000/api/v1/metrics \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "ozone",
    "display_name": "Ozone",
    "unit": "ppb",
    "category": "air_quality",
    "min_value": 0,
    "max_value": 500
  }'
```

Sensors can immediately start reporting the new metric. All visualizations and APIs adapt automatically.

## Deployment

### Production Build

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

### Environment Variables

See `.env.example` for all configurable variables.

## Monitoring

- **Prometheus** collects metrics from the API and worker services
- **Grafana** provides pre-configured dashboards
- **Structured JSON logging** is configured for all services

Key metrics:
- `sc_http_requests_total` - Request count by method/endpoint/status
- `sc_http_request_duration_seconds` - Request latency
- `sc_messages_processed_total` - Worker message processing
- `sc_sensors_active` - Active sensor count
- `sc_alerts_active` - Unacknowledged alert count

## License

MIT
