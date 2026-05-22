# Urban Pulse — Full Refactor Task System

## READ FIRST (in this order)
1. `.ai/context.md`
2. `.ai/rules.md`
3. `.ai/architecture.md`
4. `.ai/workflow.md`
5. `.ai/standards.md`
6. `.ai/refactor-context.md` — the full audit, read every section

You are the lead engineer. Work autonomously and deeply.
Never stop for confirmation. Never skip a broken area.
After each task: mark it ✅, run `git add -A && git commit -m "refactor: <what changed>"`, then continue.
If blocked, note it under Session Notes and move to the next task.

Continue iterating until no obvious weaknesses remain.

---

## Progress

**8 / 28 tasks complete**

Status: ✅ Done | 🔄 In Progress | ❌ Not Started

---

## 🏗️ Phase R1 — Foundation (do these first, everything depends on them)

- ✅ **R1.1** Fix all broken API endpoint paths in the frontend
  - Move all API key calls from `/api/v1/auth/api-keys` → `/api/v1/developer/keys`
  - Fix developer key usage response shape: map `requests_today`, `requests_this_week`, `by_endpoint` to what the UI expects
  - Fix live API tester to use full key, not key prefix
  - Fix developer docs to point at `/public/v1/*` not `/api/v1/*`
  - Fix analytics scatter plot: replace nonexistent `/api/v1/sensors/history` with `/api/v1/analytics/sensors/{sensor_id}/history`
  - Fix reports list status filter: backend param is `status_filter`, frontend sends `status`
  - Fix forecast cache key to include `hours_ahead`

- ✅ **R1.2** Create one global app shell
  - Single persistent layout in `apps/web/src/app/layout.tsx` with: top navbar, role-aware nav links, night mode toggle, demo badge
  - Remove per-page nav/header rebuilds — every page currently builds its own
  - Role-aware nav: citizen sees Map/Reports/Account; operator adds Alerts/Admin; admin adds full Admin
  - Breadcrumbs on all inner pages
  - All `AuthProvider` wrapping consolidated to root layout only — remove duplicate providers from individual pages

- ✅ **R1.3** Create a unified error + loading system
  - `<PageError message={} retry={} />` component used everywhere API calls fail
  - `<PageLoader />` skeleton component for all loading states
  - `<EmptyState message={} icon={} />` for genuinely empty data
  - Replace every silently swallowed API failure with one of these three components
  - Pages affected: dashboard, map, maps, sensors, reports, admin, developer, export, analytics

- ✅ **R1.4** Fix the map marker click conflict
  - Decide: marker click opens `SensorDrawer`, NOT navigates to `/sensors/[id]`
  - Navigation to full sensor page only via drawer's "View full details" button
  - Remove the 600ms `flyTo → navigate` pattern from `MapView`
  - Apply consistently to `MapView`, `ThematicMap`, `FutureCityMap`

- ✅ **R1.5** Fix MapLibre theme/style change bug
  - `setStyle()` destroys all custom sources and layers — broken in `ThematicMap`, `MapView`, `FutureCityMap`
  - Fix: after `map.once('styledata', ...)` re-add all sources, layers, markers, and legends
  - Or preferred: swap basemap tiles only without calling `setStyle` (swap `raster-tiles` source URL instead)
  - Apply everywhere `setStyle` is called on theme change

---

## 🎨 Phase R2 — UI/UX Overhaul

- ✅ **R2.1** Design system unification
  - Create `components/ui/` with: `Button`, `Badge`, `Card`, `Input`, `Select`, `Tabs`, `Modal`, `Drawer`, `Tooltip`, `Skeleton`
  - Every component supports dark mode via `dark:night-*` tokens
  - Replace all ad-hoc styled elements across every page with these components
  - No more inline styles, no more per-page button/card/badge variants

- ✅ **R2.2** Redesign the home/landing page
  - Remove marketing hero feel — this is an operations product
  - New layout: full-screen live map background, floating glass card top-left with city KPIs (sensor count, active alerts, AQI), daily briefing bottom-left, quick-access buttons top-right
  - HeroMap must show real sensor locations from `/api/v1/map/markers`
  - Data freshness timestamp on every stat
  - Clear CTA for operators: "Open Operations View" → `/map`

- ✅ **R2.3** Redesign the main `/map` page
  - This is the operational center — treat it like a control room
  - Left sidebar: sensor list with status indicators, search/filter by type/status/metric
  - Map center: live MapLibre with GeoJSON layers, cluster mode, pulse animations
  - Right: `SensorDrawer` slides in on marker click (no page navigation conflict — see R1.4)
  - Top bar: layer selector pills, freshness indicator, alert count badge
  - Fix: sensor report form must use real sensor coordinates, not `0,0`

- ❌ **R2.4** Redesign sensor detail page `/sensors/[id]`
  - Header: sensor name, type badge, status badge, coordinates, last seen timestamp
  - Mini map showing sensor location with surrounding sensors
  - Live metric cards: current value, unit, trend arrow, vs 24h average
  - Charts: 7-day history + forecast overlay, 24h heatmap, distribution histogram — all with real error and empty states
  - Alerts section: recent alerts for this sensor
  - Report section: form with sensor coordinates pre-filled (fix the `0,0` bug)
  - Remove `ScenarioSimulator` — it is not a real simulation, misleading to users

- ❌ **R2.5** Redesign admin page `/admin`
  - Gate by `role === "admin"` only — remove operator access (operators get 403 from backend anyway)
  - Proper management console: sidebar tabs for Sensors / Users / Alerts / Reports / Hubs
  - Each tab: data table with search, pagination, status filters
  - Sensors: create form with all required fields, edit inline, soft-delete with confirmation modal
  - Users: list with role/plan badges, role change dropdown
  - Reports: status workflow with filter
  - Show explicit permission denied state when API returns 403

- ❌ **R2.6** Redesign developer portal `/developer`
  - Tabs: API Keys / Usage / Documentation / Live Tester
  - API Keys: list with tier badge, created date, last used, copy full key (shown once on creation), revoke
  - Usage: charts from correct endpoint `/api/v1/developer/keys/{id}/usage` with correct response shape
  - Documentation: list every `/public/v1` route with method, params, example response — not internal `/api/v1` routes
  - Live Tester: full key only, show real request and response
  - Remove API key section from `/account` — consolidate everything here

- ❌ **R2.7** Consolidate export into one page at `/export`
  - Delete `/dashboard/export` — redirect to `/export`
  - Fix district filter: add real `district` field to sensors or remove the filter
  - Move in-memory rate limits to Redis
  - Show plan-based limits clearly: free vs paid capabilities
  - Store export records in DB, show history table
  - Large exports: progress indicator, not silent wait

---

## 🔌 Phase R3 — Backend Fixes

- ❌ **R3.1** Fix `/ready` health endpoint
  - Currently always returns ready — make it check: DB connection, Redis ping, RabbitMQ connection
  - Return `{ db: ok, redis: ok, rabbitmq: ok, overall: ok }`
  - Used by Docker healthcheck and Railway

- ❌ **R3.2** Move city-health logic out of `main.py`
  - Create `apps/api/app/services/city_health.py`
  - Move AQI, heat stress, livability calculations there
  - Return `null` scores with `data_available: false` when no data — not fake `50` scores
  - Fix AQI sparkline to use normalized scores
  - Redis cache with 5 min TTL

- ❌ **R3.3** Fix correlation calculation
  - Current implementation aligns by list order, not by timestamp — mathematically wrong
  - Fix: align by shared timestamps using SQL time-series join
  - Skip metric pairs with fewer than 100 shared timestamps
  - Require auth on this endpoint (currently unauthenticated and expensive)

- ❌ **R3.4** Fix forecast endpoint
  - Move Prophet computation out of request path → background task or scheduled pre-computation
  - Fix cache key to include `hours_ahead`
  - Fix concurrent SQLAlchemy async session usage in fan-out — use separate sessions per task
  - Return `data_available: false` when insufficient historical data

- ❌ **R3.5** Fix intelligence analyze endpoint
  - `response_format=json_object` conflicts with parsing response as array — fix the prompt to explicitly request a JSON array, then parse correctly
  - Return `{ available: false, reason: "AI service not configured" }` when Groq key missing
  - Frontend must display this state explicitly

- ❌ **R3.6** Fix sensor and report bugs
  - `latest` returns empty for unknown sensor — fix to return 404
  - `stats` returns all metric definitions including ones with no readings — filter to actual readings only
  - Report create: when `sensor_id` provided, use sensor's real lat/lng instead of user-submitted coordinates
  - Fix `status_filter` vs `status` query param mismatch between frontend and backend

---

## 📊 Phase R4 — Missing Pages

- ❌ **R4.1** Create `/analytics` landing page
  - Grid of analytics tools: Correlations, Anomalies, Export, City Health
  - Each card: description, last updated, quick stats
  - Fix broken back-link from `/analytics/correlations`

- ❌ **R4.2** Create `/reports/my` page
  - Calls `/api/v1/reports/me`
  - Report list with status badges, timestamps, location, category
  - Status timeline indicator
  - Map showing report locations
  - Link from dashboard "My Reports"

- ❌ **R4.3** Create `/analytics/anomalies` page
  - Table: sensor name, metric, value, z-score, detection method, timestamp
  - Filter by sensor type, severity, date range
  - Click row → sensor detail page
  - Link to related alert if fired

- ❌ **R4.4** Add data freshness indicators everywhere
  - Every data component shows "Updated Xs ago" with color: green <30s, amber 30s–2min, red >2min
  - Apply to: map markers, sensor drawer, sensor detail, city health cards, thematic map layers
  - WebSocket-connected components update freshness in real time

---

## 🤖 Phase R5 — AI Feature Honesty

- ❌ **R5.1** Make all AI features explicit about their state
  - Every AI element shows one of: `🟢 Live · Xs ago`, `🟡 Cached · Xm ago`, `🔴 Unavailable · Groq not configured`
  - Daily briefing: show generation timestamp, "Regenerate" button for operators
  - Intelligence panel: show analysis type, cache age, explicit unavailable state
  - Chatbot: show "AI unavailable" gracefully instead of 500
  - Remove any fallback text presented as AI-generated when it is not

---

## Session Notes

> Record discoveries, blockers, and unexpected findings here after each session.

- R2.1: Added shared UI primitives and migrated the global shell, page states, dashboard, account, report submission form, and demo badge to the shared Button/Badge/Card/Input/Select/Textarea/Tooltip patterns with dark-mode states. `npx tsc --noEmit` passes. `ruff check .` and `poetry run ruff check .` could not run because Ruff is not installed/available in the local Poetry environment. `npm run lint` opens the deprecated Next.js ESLint setup prompt because ESLint has not been configured.
- R2.2: Rebuilt `/` as an operations-first live map screen. `HeroMap` now renders real sensor locations from `/api/v1/map/markers`, the first viewport shows live Sensors/Alerts/AQI KPIs with freshness text, the daily briefing is compact at bottom-left, and operator quick links plus "Open Operations View" route to `/map`. `npx tsc --noEmit` passes.
- R2.3: Reworked `/map` into an operations layout with top freshness/alert/layer controls, a sensor fleet sidebar, search plus status/type/metric filters, and filtered MapLibre sensor layers feeding the existing drawer click flow. Fixed sensor report submissions from `/sensors/[id]` to use the sensor's real coordinates instead of `0,0`. `npx tsc --noEmit` passes.

---

## Loop instruction

After completing all tasks:
1. Re-read `.ai/refactor-context.md`
2. Check `git log` for everything changed
3. Look for remaining broken connections, swallowed errors, placeholder UI
4. Fix what you find and commit
5. Continue until the app matches the "what it should look like" section in `refactor-context.md`
