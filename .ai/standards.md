# Urban Pulse — Coding Standards

## Python (Backend)

- PEP 8, enforced by Ruff. Max line length: 120.
- Type hints on every function signature — no bare `def`.
- `async def` for all endpoints and DB operations.
- No comments in production code — name things so they explain themselves.

**Import order:**
1. Standard library (`asyncio`, `datetime`, `uuid`)
2. Third-party (`fastapi`, `sqlalchemy`, `pydantic`)
3. First-party packages (`smart_city_shared`, `smart_city_database`, `smart_city_auth`)
4. Relative local (`.core.dependencies`, `..models`)

**Naming:**
- `snake_case` — functions, variables, file names
- `PascalCase` — classes, enums, Pydantic models
- `UPPER_CASE` — constants
- Router files named after domain: `sensors.py`, `alerts.py`, `analytics.py`
- Router variable always: `router = APIRouter()`

**Endpoint pattern:**
```python
@router.get("/path", response_model=MyResponse)
async def handler_name(
    param: str = Query(...),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> MyResponse:
    ...
```

**Error handling:**
```python
try:
    result = await db.execute(select(Model).where(...))
except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))
```

---

## TypeScript / React (Frontend)

- `"use client"` on every interactive component.
- `interface` over `type` for object shapes.
- `const` for everything; `let` only when reassignment is truly needed.
- No `any` — use proper types or `unknown`.
- No inline `style={}` — Tailwind only.

**Naming:**
- `PascalCase` — components, interfaces
- `camelCase` — functions, variables, hooks
- `UPPER_CASE` — constants (`UNIT_MAP`, `METRIC_ICONS`)
- File names: `kebab-case.tsx` for pages, `PascalCase.tsx` for components

**Component pattern:**
```tsx
"use client";
import { useState, useEffect } from "react";
import { useTheme } from "@/lib/theme-context";
import { useAuth } from "@/lib/auth-context";

interface MyComponentProps {
  sensorId: string;
}

export default function MyComponent({ sensorId }: MyComponentProps) {
  const { nightMode } = useTheme();
  const { user } = useAuth();
  // ...
}
```

**Tailwind patterns:**
```
Card:       bg-white dark:bg-night-secondary rounded-xl shadow p-6
Header:     bg-white/70 dark:bg-night-secondary/70 backdrop-blur-md border-b border-gray-200 dark:border-night-border
Button:     px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors
Link:       text-gray-600 dark:text-gray-300 hover:text-primary-600
Loading:    text-gray-500 dark:text-gray-400 text-center py-12
Error:      text-red-500 text-center py-12
Badge ok:   bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400
Badge warn: bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400
Badge crit: bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400
```

---

## Recharts

```tsx
<ResponsiveContainer width="100%" height={240}>
  <LineChart data={data}>
    <CartesianGrid strokeDasharray="3 3" stroke={nightMode ? "#374151" : "#e5e7eb"} />
    <XAxis dataKey="time" tick={{ fontSize: 10, fill: nightMode ? "#9ca3af" : "#6b7280" }} />
    <YAxis tick={{ fontSize: 10, fill: nightMode ? "#9ca3af" : "#6b7280" }} />
    <Tooltip
      contentStyle={{
        backgroundColor: nightMode ? "#1f2937" : "#fff",
        border: "1px solid #374151",
        borderRadius: 8,
      }}
    />
    <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={false} />
  </LineChart>
</ResponsiveContainer>
```

Colors: blue `#2563eb`, indigo `#4f46e5`, green `#16a34a`, amber `#d97706`, red `#dc2626`.

---

## MapLibre

```tsx
// Always dynamic import
const Map = dynamic(() => import("@/components/maps/ThematicMap"), {
  ssr: false,
  loading: () => <div className="h-full bg-gray-100 dark:bg-night-secondary animate-pulse rounded-xl" />,
});

// Instance tracking
const mapRef = useRef<maplibregl.Map | null>(null);

// Cleanup
useEffect(() => {
  return () => { mapRef.current?.remove(); };
}, []);

// GeoJSON layers over DOM Markers
map.addSource("sensors", { type: "geojson", data: geojson, cluster: true });
map.addLayer({ id: "sensor-dots", type: "circle", source: "sensors", paint: { ... } });
```

Tile styles from `@/lib/map-styles`: use `LIGHT_STYLE` / `DARK_STYLE` based on `nightMode`.

---

## Git

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- One logical change per commit — atomic and reviewable
- Never stage: `.env`, `node_modules/`, `__pycache__/`, `.next/`, `*.pyc`

**Before every commit:**
```bash
cd apps/web && npx tsc --noEmit   # type check
cd apps/api && ruff check .        # lint
docker compose ps                  # all services healthy
git status                         # .env not staged
```