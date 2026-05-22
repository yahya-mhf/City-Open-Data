# AI Coding Rules — Urban Pulse

## General

- Read relevant files before editing. Never assume an edit will succeed without reading the target first.
- Mimic existing code style, patterns, and conventions in every file you touch.
- Use the same libraries and imports as neighboring files — never introduce a new dependency without checking `package.json` / `pyproject.toml` first.
- Keep changes minimal and focused. One task per commit.
- Never commit secrets, `.env`, or `node_modules` to git.

## Backend (Python / FastAPI)

- Use `async def` for all endpoint handlers and DB operations.
- Import `AsyncSession` from `sqlalchemy.ext.asyncio`; get it via `Depends(get_db)`.
- Import models from `smart_city_database.models`, schemas from `smart_city_shared.schemas`.
- Use Pydantic models for request/response validation in `schemas.py`.
- Use `from smart_city_shared.enums import MetricCategory` for enum values — never hardcode strings.
- Settings are in `smart_city_shared.config` via the `settings` singleton.
- New routers go in `apps/api/app/routers/` and are registered in `main.py` with `app.include_router(router, prefix="...")`.
- New API v1 endpoints go in `apps/api/app/api/v1/endpoints/` and are included via `apps/api/app/api/v1/routes.py`.
- Reuse `from ..core.dependencies import get_db, get_current_user, require_admin` etc.
- Use SQLAlchemy `select()` with `.where()`, not raw SQL unless necessary.
- No comments in production code — keep it self-documenting.

## Frontend (Next.js / TypeScript / React)

- All interactive components use `"use client"`.
- Dynamic imports (`next/dynamic`) with `ssr: false` for MapLibre components.
- Use `useTheme()` from `@/lib/theme-context` for dark mode — never toggle classes manually.
- Use `useAuth()` from `@/lib/auth-context` for auth state.
- API calls go through `api.*` from `@/lib/api` — never `fetch()` directly (except for non-v1 endpoints).
- New metric types must be added to: `UNIT_MAP` in `map-layers.ts`, `METRIC_ICONS` in `marker-icons.ts`, `gradients` in `ThematicMap.tsx`, and `getColorScheme` / `getGradient` if a new category.
- No emojis in code/output unless the user explicitly asks.
- Tailwind classes only — no inline styles or CSS modules unless unavoidable.
- Dark mode uses `dark:` prefix with `night-*` color tokens (e.g., `dark:bg-night-secondary`).

## Data & Metrics

- Sensor readings table: `sensor_readings` (TimescaleDB hypertable, composite PK: `time + sensor_id + metric_id`).
- Metric definitions table: `metric_definitions` (keyed by UUID, unique `key` string).
- Adding a new metric type requires updates in ALL of:
  1. `apps/api/app/scripts/seed.py` — `MetricDefinition` row
  2. `seed_historical.py` — `_METRIC_META` dict + generation logic
  3. `apps/api/app/routers/internal.py` — `_METRIC_GENERATORS` dict
  4. `apps/simulator/app/generator.py` — `SensorState` + `generate_readings()`
  5. Frontend: `UNIT_MAP`, `METRIC_ICONS`, `gradients`, `getColorScheme`, `getGradient`
  6. If new category: `MetricCategory` enum in `enums.py` + `categoryColors` in `maps/page.tsx`
- Always query existing metric keys dynamically from the DB — never hardcode a metric list in an endpoint.

## Recharts

- Wrap every chart in `<ResponsiveContainer width="100%" height={N}>`.
- Use `CartesianGrid strokeDasharray="3 3"` for grid lines.
- Use `type="monotone"` on `Line` for smooth curves.
- Set `dot={false}` on time-series lines unless sparse data.
- Match stroke colors to the theme: blue (`#2563eb` / `#4f46e5`), green for positive, red for critical.
