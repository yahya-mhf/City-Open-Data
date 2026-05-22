# Urban Pulse — Development Workflow

## Repository Structure

```
/
├── .ai/                   # AI coding context (rules, arch, workflow, tasks)
├── .github/workflows/     # GitHub Actions
├── apps/
│   ├── api/               # FastAPI backend
│   │   └── app/
│   │       ├── api/v1/endpoints/   # Route handlers by domain
│   │       ├── core/               # Dependencies, Redis, MinIO, WS
│   │       ├── routers/            # Maps, forecast, intelligence, chatbot
│   │       └── scripts/            # seed.py
│   ├── web/               # Next.js frontend
│   │   └── src/
│   │       ├── app/       # App router pages
│   │       ├── components/ # Shared React components
│   │       ├── lib/        # API client, auth, theme, MapLibre
│   │       └── workers/    # Web Workers (IDW interpolation)
│   └── simulator/         # Sensor data simulator
├── packages/
│   ├── shared/            # Config, enums, schemas (Pydantic)
│   ├── database/          # SQLAlchemy models, migrations
│   ├── auth/              # JWT + RBAC helpers
│   └── observability/     # Logging setup
├── docker-compose.yml
├── seed_historical.py     # 90-day historical data seeder
└── SETUP.md               # Configuration guide
```

## Local Development

### Start all services

```bash
# Infrastructure (first terminal)
docker compose up -d timescaledb redis rabbitmq minio

# API (second terminal)
docker compose up -d api
docker compose logs -f api

# Frontend (third terminal)
cd apps/web && npm run dev
```

### Docker-free API (if Docker build fails)

```bash
# Install deps on host
pip install poetry
cd apps/api && poetry install
cd packages/shared && poetry install
cd ../database && poetry install
cd ../auth && poetry install
cd ../observability && poetry install
cd ../../apps/api

# Run with host Python
poetry run uvicorn app.main:app --reload
```

### Seed data

```bash
# Initial schema + metric definitions + sensors
docker exec sc-api-1 poetry run python -m app.scripts.seed

# Historical readings (90 days)
docker cp seed_historical.py sc-api-1:/app/seed_historical.py
docker exec sc-api-1 python /app/seed_historical.py --days 90

# Hourly live injection (via GitHub Actions or manual)
curl -X POST http://localhost:8000/internal/seed-latest \
  -H "INTERNAL_SECRET: your-secret"
```

### Code changes

- **API:** Backend hot-reloads via `uvicorn --reload` watching `/app/apps/api` and `/app/packages`
- **Frontend:** Next.js fast refresh on save
- **Simulator/Worker:** Must restart container after changes (not bind-mounted for reload)

## Testing

```bash
# Backend
cd apps/api && poetry run pytest -v

# Frontend
cd apps/web && npm test  # jest
npm run lint             # next lint
npx tsc --noEmit         # type check
```

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: new sensor types, hero redesign
fix: chatbot send button not working
docs: add setup guide
refactor: replace Marker() with GeoJSON layers
chore: update dependencies
```

## Branch Strategy

- `main` — production-ready, deployed automatically
- Feature branches: `feat/<name>` — squash-merge to main
- Fix branches: `fix/<name>`

## Before Committing

1. Run `npx tsc --noEmit` in `apps/web/` (frontend)
2. Run `ruff check .` in `apps/api/` (backend lint)
3. Verify `docker compose ps` shows all services healthy
4. Check `.env` is NOT staged (`git status` should NOT show `.env`)
