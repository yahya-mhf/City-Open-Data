# Urban Pulse — Coding Standards

## Python (Backend)

### Style
- Follow PEP 8 (enforced by Ruff).
- Max line length: 120 characters.
- Use type hints on all function signatures.
- Use `async def` for all endpoint handlers and DB operations.
- No comments in production code — code should be self-documenting.

### Imports
Order:
1. Standard library (`asyncio`, `datetime`, etc.)
2. Third-party (`fastapi`, `sqlalchemy`, etc.)
3. First-party packages (`smart_city_shared`, `smart_city_database`, etc.)
4. Relative local imports (`.core.dependencies`, `..models`)

### Naming
- `snake_case` for functions, variables, file names
- `PascalCase` for classes, enums, Pydantic models
- `UPPER_CASE` for constants
- Router files are named after their domain: `sensors.py`, `alerts.py`, `maps.py`
- Router variables always named `router = APIRouter()`

### FastAPI Patterns
```python
@router.get("/path")
async def handler(
    param: str = Query(...),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    ...
```

### Error Handling
- Use `HTTPException` with appropriate status codes.
- Catch exceptions at the handler level with `try/except`.
- Use `from smart_city_auth import RBACHelper` for permission checks.

## TypeScript / React (Frontend)

### Style
- Use `"use client"` for all interactive components.
- Use `interface` over `type` for object shapes.
- Use `const` for all values; avoid `let` unless reassignment is required.
- No `any` — use proper types or `unknown`.

### Naming
- `PascalCase` for components and interfaces
- `camelCase` for functions, variables, instances
- `UPPER_CASE` for constants
- File names: `kebab-case.tsx` for page routes, `PascalCase.tsx` for components

### Component Pattern
```tsx
"use client";
import { useState, useEffect } from "react";
import { useTheme } from "@/lib/theme-context";

export default function MyComponent({ prop }: { prop: string }) {
  const { nightMode } = useTheme();
  // ...
}
```

### Tailwind
- Use Tailwind classes exclusively — no inline `style={}` props.
- Dark mode: prefix with `dark:` using `night-*` color tokens.
- Responsive: `sm:`, `md:`, `lg:` breakpoints.
- Common patterns:
  - Cards: `bg-white dark:bg-night-secondary rounded-xl shadow p-6`
  - Headers: `bg-white/70 dark:bg-night-secondary/70 backdrop-blur-md border-b`
  - Buttons: `px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700`
  - Links: `text-gray-600 dark:text-gray-300 hover:text-primary-600`
  - Loading: `text-gray-500 text-center py-12`

### Charts (Recharts)
```tsx
<ResponsiveContainer width="100%" height={200}>
  <LineChart data={data}>
    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
    <YAxis tick={{ fontSize: 10 }} />
    <Tooltip />
    <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={false} />
  </LineChart>
</ResponsiveContainer>
```

## MapLibre Patterns
- Dynamic import with `ssr: false` and loading fallback.
- `interactive: false` for background/decorative maps.
- Use `useRef<maplibregl.Map | null>(null)` for instance tracking.
- Clean up with `map.remove()` in the `useEffect` return.
- Tile styles from `@/lib/map-styles` (`LIGHT_STYLE` / `DARK_STYLE`).
- GeoJSON circle layers over DOM `Marker()` for performance.
- Cluster mode enabled on sensor sources.

## Database

- All tables use UUID primary keys or composite keys.
- `sensor_readings` is a TimescaleDB hypertable partitioned by `time`.
- Metric keys are unique strings stored in `metric_definitions`.
- Queries use SQLAlchemy ORM `select()` with `.where()` — no raw SQL except for bulk inserts.

## Git

- Conventional Commits for commit messages.
- Keep commits focused — one logical change per commit.
- Never commit: `.env`, `node_modules/`, `__pycache__/`, `.next/`, `*.pyc`.
