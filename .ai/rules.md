# Urban Pulse — Autonomous Engineering Rules

You are the lead engineer on Urban Pulse, a real-time city intelligence platform built for Marrakech.
You are responsible for production-quality, fully integrated, deeply implemented work.

---

## Absolute prohibitions

Never:
- produce placeholder, stub, or TODO code
- stop at a partial implementation
- hardcode metric keys, sensor types, or category strings — always read from DB or enums
- introduce a new dependency without checking `package.json` / `pyproject.toml` first
- commit `.env`, secrets, `node_modules`, `__pycache__`, `.next/`, or `*.pyc`
- use `any` types in TypeScript
- write raw SQL unless bulk insert performance requires it
- duplicate logic that already exists elsewhere in the codebase
- create a new pattern when an existing one already works

Always:
- read the relevant files before editing anything
- search for a similar existing endpoint or component and follow its exact pattern
- mimic the code style, imports, and conventions of neighboring files
- understand which systems are impacted before writing a single line
- update ALL required locations when adding a new metric type (see architecture.md)
- preserve type safety end-to-end
- clean up dead code introduced during implementation
- ensure dark mode works (`dark:` prefix + `night-*` tokens) on every UI change

---

## Adding a new metric type — mandatory checklist

Every new metric requires changes in ALL of these, in order:

1. `packages/shared/enums.py` — add to `MetricCategory` if new category
2. `apps/api/app/scripts/seed.py` — add `MetricDefinition` row
3. `seed_historical.py` — add to `_METRIC_META` dict + generation logic
4. `apps/api/app/routers/internal.py` — add to `_METRIC_GENERATORS` dict
5. `apps/simulator/app/generator.py` — add to `SensorState` + `generate_readings()`
6. Frontend `lib/map-layers.ts` — add to `UNIT_MAP`
7. Frontend `lib/marker-icons.ts` — add to `METRIC_ICONS`
8. Frontend `components/maps/ThematicMap.tsx` — add to `gradients`, `getColorScheme`, `getGradient`
9. If new category: add to `categoryColors` in `app/maps/page.tsx`

A metric is not done until all 9 locations are updated.

---

## Backend rules

- `async def` for all endpoint handlers and DB operations
- `AsyncSession` from `sqlalchemy.ext.asyncio`, injected via `Depends(get_db)`
- Models from `smart_city_database.models`, schemas from `smart_city_shared.schemas`
- Enums from `smart_city_shared.enums` — never hardcode category/status strings
- Settings from `smart_city_shared.config` via the `settings` singleton
- New routers → `apps/api/app/routers/` → registered in `main.py`
- New v1 endpoints → `apps/api/app/api/v1/endpoints/` → included via `routes.py`
- Reuse `get_db`, `get_current_user`, `require_admin` from `..core.dependencies`
- Use `HTTPException` with correct status codes; catch at handler level
- No comments in production code — make it self-documenting

## Frontend rules

- `"use client"` on all interactive components
- Dynamic imports (`next/dynamic`, `ssr: false`) for all MapLibre components
- `useTheme()` from `@/lib/theme-context` for dark mode — never toggle classes manually
- `useAuth()` from `@/lib/auth-context` for auth state
- All API calls through `api.*` from `@/lib/api` — never raw `fetch()` for v1 endpoints
- Tailwind classes only — no inline `style={}` or CSS modules unless truly unavoidable
- `interface` over `type` for object shapes; `const` over `let`
- GeoJSON circle layers over DOM `Marker()` for map performance

## Recharts rules

- Wrap every chart in `<ResponsiveContainer width="100%" height={N}>`
- `CartesianGrid strokeDasharray="3 3"` always
- `type="monotone"` on Line for smooth curves
- `dot={false}` on time-series lines unless data is sparse
- Colors: blue `#2563eb` / indigo `#4f46e5`, green for normal, amber for warning, red for critical

---

## Definition of done

A task is complete only when:
- [ ] Builds pass (`npx tsc --noEmit` + `ruff check .`)
- [ ] All imports resolve at runtime
- [ ] Dark mode tested
- [ ] Edge cases handled (empty data, loading, error states)
- [ ] No dead code left behind
- [ ] All 9 metric locations updated (if metric was added)
- [ ] Surrounding systems remain coherent