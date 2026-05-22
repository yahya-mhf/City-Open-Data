# Refactor Context

Audit date: 2026-05-22

This is a brutally honest codebase inventory for planning a full refactor. It documents the current state as implemented, including modified and untracked files in the working tree. No fixes were made.

## Executive Summary

Urban Pulse is a Next.js frontend backed by a FastAPI API, Redis, PostgreSQL/TimescaleDB, MinIO, a simulator, and a worker. The app has a lot of ambitious surface area: auth, sensor maps, thematic maps, forecasting, AI intelligence, chatbot, reports, admin, developer portal, export, charts, correlations, QR codes, WebSockets, and anomaly detection.

The main problem is not a lack of features. The main problem is that the features are only partially connected and the API contract is inconsistent. Several frontend pages call endpoints that do not exist, use the wrong path prefix, send the wrong data shape, or silently swallow failures. The UI often looks like a demo stitched from separate iterations rather than one product. Many pages have no real error state, no empty state worth using, and no consistent navigation or layout system.

The app currently looks like a prototype/demo with many cards, maps, and experimental panels. It should look like a focused smart-city operations dashboard: dense, calm, map-first where appropriate, with explicit data freshness, consistent navigation, reliable error states, and clear role-based surfaces for citizens, operators, admins, and API developers.

## Frontend Pages

### `/` - Home

File: `apps/web/src/app/page.tsx`

What it does:
- Landing/home page with auth-aware nav.
- Displays a hero map, city stats, city health cards, daily AI briefing, and feature cards.
- Polls `/api/v1/city-stats` every 5 seconds.

Problems:
- It is mostly a marketing/hero page, not an operational first screen.
- `HeroMap` is decorative and not connected to actual sensor locations.
- It wraps content in a glass card over the hero, creating a landing-page feel instead of a serious operations product.
- Stats failures are silently ignored, leaving `--` forever.
- Demo mode appears in both `DemoBadge` and this nav, so there are duplicate demo controls.
- Feature cards use emoji/icons and marketing claims rather than real feature entry points.

Placeholder/fake/disconnected:
- "Watch Demo" just scrolls to features. It is not a demo.
- Demo mode toggles theme-ish behavior but is not clearly wired to API mocking or seeded demo data.

### `/login`

File: `apps/web/src/app/login/page.tsx`

What it does:
- Auth login form.
- Calls `api.auth.login`, then `/auth/me`, then routes to `/dashboard`.

Problems:
- No handling for `?registered=1`, even though register redirects there.
- No password reset path.
- No global auth layout; looks visually disconnected from rest of app.

### `/register`

File: `apps/web/src/app/register/page.tsx`

What it does:
- Registration form.
- Calls `/auth/register`, then redirects to login.

Problems:
- No auto-login after register.
- No server password policy visibility beyond `minLength=6`.
- Same disconnected auth-card styling as login.

### `/dashboard`

File: `apps/web/src/app/dashboard/page.tsx`

What it does:
- Auth-gated dashboard.
- Shows counts for sensors, alerts, and current user's reports.
- Links to map, reports, export, admin.

Problems:
- Calls are silently swallowed on failure, so counts can show `0` when the API is broken.
- `reports` link text says "My Reports" but routes to `/reports`, which is a public reports map/list, not the user's report list.
- Design is a generic card grid. It does not feel like an operations dashboard.
- No loading skeletons for counts.
- No data freshness timestamps.
- No role-specific information architecture beyond conditionally showing Admin.

### `/map`

File: `apps/web/src/app/map/page.tsx`

What it does:
- Loads `/api/v1/map/markers`.
- Renders `MapView`.
- Tracks `selectedSensorId` and renders `SensorDrawer`.

Problems:
- `MapView` navigates to `/sensors/{id}` on marker click and also calls `onSensorClick`. That means the drawer and full page behavior conflict; the app starts opening a drawer but then navigates away after 600ms.
- Contains debug `console.log` calls.
- API failures are swallowed and result in an empty map.
- Auth is wrapped but `user` is unused.
- It should be the core live operations view, but currently has minimal filters, no sensor status summary, no data freshness, and no layer control.

### `/maps`

File: `apps/web/src/app/maps/page.tsx`

What it does:
- Lists metric layers from `api.maps.metrics()`.
- Links to individual metric maps and future-city overview.
- Includes an API teaser.

Broken:
- `api.maps.metrics()` calls `/api/v1/maps/metrics`, which exists because `maps_router` is mounted separately in `main.py`. Good.
- The API teaser says to call `{NEXT_PUBLIC_API_URL}/maps/metrics` with `x-api-key`. This is wrong for external API consumers. Public API endpoints are under `/public/v1`, and `/api/v1/maps/metrics` does not enforce API key auth.

Problems:
- Metric card colors are hardcoded and incomplete.
- No API error state.
- Page is a simple gallery, not a layer catalog with previews, coverage, freshness, or quality.

### `/maps/[metric]`

File: `apps/web/src/app/maps/[metric]/page.tsx`

What it does:
- Loads metric metadata and latest layer data.
- Provides live/history/forecast modes.
- Fetches history from `/api/v1/maps/layers/{metric}/history`.
- Fetches forecasts from `/api/v1/maps/layers/{metric}/forecast`.
- Opens sensor drawer in live mode.
- Shows an Intelligence panel backed by `/api/v1/intelligence/analyze`.

Problems:
- Very large component with data fetching, timeline state, forecast state, intelligence state, chart overlays, and page layout all mixed together.
- History fetch manually builds URLs instead of using the API client.
- History fetch failures are swallowed.
- Forecast failures are swallowed.
- Several effects use boolean expressions in dependency arrays, which is fragile and can miss meaningful state changes.
- Date handling appends `:00Z` to local datetime values, treating local input as UTC.
- Chart overlays can cover map controls and other controls.
- Intelligence only runs when user clicks the panel/type; there is no clear "no results" explanation.
- `user` and `token` are pulled but mostly unused.

Broken/suspect:
- The `ThematicMap` component calls `map.setStyle(...)` on theme change without re-adding all custom sources/layers. MapLibre removes custom sources/layers on style changes; this can break thematic layers, sensors, legends, and intelligence overlays.
- Forecast endpoint returns an object when `sensor_id` is passed and a list when not. The API client models this, but the UI has to know both shapes.

### `/maps/future`

File: `apps/web/src/app/maps/future/page.tsx`

What it does:
- Loads all metrics and all layers.
- Groups sensors by metric category.
- Renders `FutureCityMap`.
- Runs `api.intelligence.analyze` for all metric keys against visible map bounds.

Problems:
- Expensive: fan-outs one API call per metric on page load.
- If Groq is not configured, intelligence fails; the UI silently hides the error.
- Category grouping is based on metric category, so the same physical sensor can appear under multiple categories.
- This looks like a demo visualization, not a usable planning/operations surface.
- No drilldown from categories or intelligence regions.

### `/maps/compare`

File: `apps/web/src/app/maps/compare/page.tsx`

What it does:
- Loads metrics.
- Shows two `ThematicMap` components side by side.
- Syncs map movement between them.

Problems:
- Errors are swallowed for metrics and layer loads.
- It reuses `ThematicMap`, which includes search bars, legends, interpolation controls, and internal behavior. In compare mode this duplicates controls and creates clutter.
- Sync is only `moveend`; interaction can feel laggy.
- There is no shared color scale or normalized legend, so visual comparison can be misleading.

### `/sensors/[id]`

Files:
- `apps/web/src/app/sensors/[id]/page.tsx`
- `apps/web/src/app/sensors/[id]/sensor-view.tsx`
- `apps/web/src/app/sensors/[id]/MiniMap.tsx`

What it does:
- Server component fetches sensor for metadata.
- Client page polls sensor and latest readings.
- Opens WebSocket for sensor updates.
- Renders charts, scenario simulator, report form, QR code, mini map.

Broken:
- The "Report an Issue" form submits `latitude=0` and `longitude=0`; reports from a sensor page are geospatially wrong.
- WebSocket update filtering checks whether `msg.data.key.includes(id)`. It depends on Redis key string shape and is easy to false-positive/false-negative.

Problems:
- `token` is read directly from `localStorage`, bypassing `AuthProvider`.
- Report categories are only three options here, unlike `/reports/new`.
- Sensor metric units are blank because metric metadata is inferred from latest metric keys.
- No clear stale-data warning for latest readings.
- The full page duplicates functionality already in `SensorDrawer`.

### `/reports`

File: `apps/web/src/app/reports/page.tsx`

What it does:
- Public reports map/list.
- Loads `/api/v1/reports/public`.
- Filters by category based only on currently loaded reports.

Problems:
- Category dropdown is built from the current result set. Once a category filter is applied, other categories disappear from the filter options.
- Map is initialized once with a closure over `reports`; click handler can use stale report arrays.
- Map style changes are not handled correctly on night mode; the map effect recreates/removes the map based on `nightMode`, but marker source update only runs when reports change.
- No authenticated "my reports" view even though dashboard implies one.
- Image rendering uses raw `img`.

### `/reports/new`

File: `apps/web/src/app/reports/new/page.tsx`

What it does:
- Auth-gated report submission form.
- Uses `LocationPicker`.
- Supports optional image upload.

Problems:
- No file size/type pre-check in the browser even though backend enforces it.
- No geolocation shortcut.
- No draft preservation.
- Styling ignores dark mode for most controls.
- Category taxonomy does not match the sensor detail report form.

### `/account`

File: `apps/web/src/app/account/page.tsx`

What it does:
- Shows subscription cards and coupon application.
- Shows API key management UI.

Broken:
- API key calls use `api.apiKeys.*`, which currently hits `/api/v1/auth/api-keys`. No such backend endpoints exist.
- Real key endpoints are mounted at `/api/v1/developer/keys`.

Problems:
- Plan upgrades are coupons only; pricing UI implies real billing but there is no billing.
- `isPaid` controls API key UI, but backend developer key endpoints do not enforce plan gating.
- New key prefix is computed with `key.key.slice(0, 8)` instead of using backend prefix field.
- "Copied! Dismiss" both copies and dismisses, but the label is misleading.

### `/developer`

File: `apps/web/src/app/developer/page.tsx`

What it does:
- Developer portal with API keys, usage analytics, docs, and live API tester.

Broken:
- Calls `/api/v1/auth/api-keys`, `/api/v1/auth/api-keys/{id}`, and `/api/v1/auth/api-keys/{id}/usage`; none exist.
- Backend mounted key management under `/api/v1/developer/keys`.
- Create key payload uses `metric_restrictions`, but backend schema appears to expect `allowed_metrics` / `allowed_endpoints`.
- Usage analytics UI expects `daily`, `endpoints`, `error_rate`, `avg_response_time_ms`, `current_minute_requests`. Backend `/developer/keys/{id}/usage` returns `requests_today`, `requests_this_week`, `by_endpoint`, `avg_response_time_ms`, `error_rate`. Wrong shape.
- Live API tester sends `x-api-key: selectedKey.key_prefix`, but key prefixes are not valid API keys.
- Docs show authenticated internal `/api/v1/...` paths as if they are external API key paths. The actual API key product is `/public/v1/...`.

Problems:
- This page is huge and mixes docs, API key CRUD, tester, and analytics in one file.
- Docs are manually hardcoded and already diverged from backend.
- Tiers include `basic`, while account plans include `free`, `pro`, `enterprise`. Plan/tier model is inconsistent.

### `/admin`

File: `apps/web/src/app/admin/page.tsx`

What it does:
- Operator/admin panel for sensors, users, hubs, alerts, reports.

Broken:
- Frontend lets operators into Admin (`user.role === "operator" || admin`), but backend admin endpoints require `require_admin` for users/sensors/hubs. Operators will see the page but requests fail silently.
- `api.admin.sensors.create({ name, latitude, longitude })` omits fields likely required by `SensorCreate` such as `type` depending on schema.
- Report status option uses `under_review`, but other UI uses `in_progress`; backend does not normalize statuses.

Problems:
- All initial API failures are swallowed; empty tables can mean "no data" or "permission denied".
- No create user UI, delete sensor UI, create hub UI despite client methods existing.
- No validation or error display for add sensor.
- No pagination/search.
- Admin is not a serious management console yet.

### `/export`

File: `apps/web/src/app/export/page.tsx`

What it does:
- Auth-gated export page using `ExportPanel`.

Problems:
- Duplicates `/dashboard/export` with slightly different copy and layout.
- Public nav route is not clearly linked elsewhere.

### `/dashboard/export`

File: `apps/web/src/app/dashboard/export/page.tsx`

What it does:
- Dashboard export page using `ExportPanel`.

Problems:
- Duplicate of `/export`.
- Copy claims "Exports are rate-limited to 10 per hour. Historical data is retained for 90 days." Backend uses in-memory rate limit and no explicit 90-day retention enforcement in export endpoint.
- `isPaid` copy says Pro for raw granularity and Parquet, matching backend generally, but there is no clear explanation of free allowed granularities.

### `/analytics/correlations`

File: `apps/web/src/app/analytics/correlations/page.tsx`

What it does:
- Loads correlation matrix from `/api/v1/analytics/correlations`.
- Shows grid and scatter plot modal.

Broken:
- Scatter plot fetches `/api/v1/sensors/history?metric_key=...`, but backend has no global `/sensors/history` endpoint. Sensor history requires `/sensors/{sensor_id}/history`, and analytics history requires `/analytics/sensors/{sensor_id}/history`.
- Header links back to `/analytics`, but no `/analytics` page exists in the file tree.

Problems:
- Backend correlation calculation aligns unrelated flattened series by list order, not by timestamp and sensor, so reported correlations can be mathematically misleading.
- React fragment in matrix map has no key, likely causing console warnings.
- No dark-mode toggle in header despite using dark classes.

### `/not-found`

File: `apps/web/src/app/not-found.tsx`

What it does:
- Custom 404.

Problems:
- Minimal and likely visually inconsistent.

## Frontend Components

### `MapView`

File: `apps/web/src/components/MapView.tsx`

What it does:
- Generic live sensor map with address search.
- Uses helper functions from `map-layers`.

Broken/problematic:
- Marker click both flies to sensor and routes to `/sensors/{id}` while also calling `onSensorClick`. This conflicts with drawer behavior on `/map`.
- Theme style changes call `setStyle` then re-add layers, but source data may not reliably be restored after style reload.
- The first metric displayed is whichever key is first in object order; this is arbitrary.

### `ThematicMap`

File: `apps/web/src/components/ThematicMap.tsx`

What it does:
- MapLibre thematic surface with IDW interpolation worker, sensor dots, legend, interpolation controls, intelligence overlays, search, WebSocket live updates.

Problems:
- Too much responsibility for one component.
- Direct DOM injection for legend, time label, and interpolation controls bypasses React state and accessibility.
- Uses `innerHTML` for popup/control HTML. Most values come from app data; this should be treated carefully.
- Theme changes via `setStyle` can remove custom sources/layers and leave the map broken.
- Interpolation controls appear even in compare contexts where they add clutter.
- Uses actual data min/max for legend in places and metric min/max for raster in places; interpretation can be inconsistent.
- AI region "circles" are rectangles approximated from radius, not circles.

### `FutureCityMap`

What it does:
- Category-colored sensor map plus intelligence overlays.

Problems:
- Also uses direct DOM legend injection.
- Theme `setStyle` issue applies here too.
- No click handlers for sensors or intelligence regions.
- Category grouping can duplicate sensors conceptually.

### `HeroMap`

What it does:
- Decorative non-interactive moving MapLibre background.

Placeholder/disconnected:
- Not connected to real sensor data.
- Pure visual background.

### `SensorDrawer`

What it does:
- Portal drawer for sensor details, latest metrics, alerts, historical charts for paid users, CSV download, QR code, link to full sensor page.

Broken/problematic:
- `SensorDrawer` relies on `useAuth`, but `/map` wraps `AuthProvider` locally and the root layout also wraps providers; provider nesting may make auth state inconsistent depending on layout.
- Historical data is feature-gated in UI, but `/api/v1/sensors/{id}/history` itself allows free users with truncated range.
- CSV export uses `/api/v1/analytics/export`, which requires paid auth and returns JSON-wrapped CSV lines, while the newer export panel uses `/api/v1/export/sensors` and streams file responses. Export mechanisms are duplicated.

### `SensorCharts`

What it does:
- Live stats, 7-day history plus forecast, heatmap, distribution.

Problems:
- Fan-outs many calls per sensor and metric.
- Forecast failures are hidden and shown as no forecast.
- Loading states are decent, but error states are absent.
- It displays all active metric definitions from stats even if this sensor does not report them.
- Histogram and heatmap are current month/last 30 days but not clearly tied to available data retention.

### `ScenarioSimulator`

What it does:
- Lets user adjust metric values and calls `/sensors/{id}/simulate`.

Placeholder/fake:
- Backend simulation is not a model. It only compares current values with user-adjusted values and reports diff/percent change. It does not simulate city impact, downstream metrics, forecasts, or interventions.

### `ExportPanel`

What it does:
- Select sensors, metrics, date range, format, granularity.
- Calls `/api/v1/export/preview` and `/api/v1/export/sensors`.
- Stores export history in localStorage.

Problems:
- Uses raw `fetch` instead of API client.
- Export history is local-only and not tied to backend export records.
- "district" filtering sends `district`, but backend implements it as `Sensor.type == district`, not a real district.
- Plan logic is split between frontend gating and backend checks.

### `CityHealth`

What it does:
- Fetches `/api/v1/city-health`.
- Renders AQI, heat stress, and livability cards.

Problems:
- Scores are custom formulas embedded in `main.py`, not documented or versioned.
- If backend has no data it returns neutral `50` scores, which can look like real moderate conditions.
- Error states likely collapse to generic failure/empty rather than explaining missing data.

### `DailyBriefing`

What it does:
- Fetches `/api/v1/intelligence/briefing`.
- Typewriter-renders paragraphs.

Problems:
- If Groq is missing, backend returns fallback text, but the UI presents it as an AI briefing.
- Typewriter animation can be slow/noisy for operational use.

### `IntelligencePanel`

What it does:
- Side panel for selecting analysis types and viewing AI suggestions.

Problems:
- AI suggestions are only as reliable as Groq output and the backend parser.
- No strong distinction between cached, failed, empty, and fresh results.

### `PulseAIChat` / `ChatWrapper`

What it does:
- Floating AI chat using SSE `/chatbot/message`, suggestions `/chatbot/suggestions`, and alerts WebSocket.

Problems:
- Direct `fetch` instead of API client.
- Requires auth; unauthenticated behavior is likely weak.
- Depends on Groq. If missing, message endpoint returns 500.
- Suggestions are hardcoded by page names and include outdated metric names like pollution/rainfall/seismic that may not match current metrics.

### `SeismicAlertModal` / `SeismicAlertWrapper`

What it does:
- Listens on alerts WebSocket for seismic events and shows modal.

Problems:
- Only seismic events are specially handled. General alerting is otherwise fragmented.
- Seismic event backend source is Redis pubsub, not clearly represented in main API.

### `AddressSearchBar`

What it does:
- Geocodes addresses/places, likely using external search.

Problems:
- External dependency and failure behavior need review.
- Repeated implementation of temporary search pin exists in multiple map components.

### `LocationPicker`

What it does:
- Map picker for report location.

Problems:
- Uses custom inline HTML marker.
- No geolocation shortcut or address search visible from inspected form.

### `SensorQRCode`

What it does:
- Generates QR code for sensor page.

Problems:
- Depends on runtime URL construction; needs production URL validation.

### `DemoBadge` and theme context

What it does:
- Toggles demo mode and night mode.

Problems:
- Demo mode is not a real data mode. It is a UI state that can mislead users into thinking fake data is available or active.
- Theme support is inconsistent; many pages use dark classes but root/page backgrounds remain light.

## Backend Endpoints

### App-level endpoints

File: `apps/api/app/main.py`

Endpoints:
- `GET /health`
- `GET /ready`
- `GET /api/v1/city-health`
- `GET /api/v1/city-stats`
- `GET /metrics` Prometheus ASGI mount
- `WS /ws/{channel}`

Problems:
- `/ready` always returns ready; it does not check DB, Redis, MinIO, migrations, or worker health.
- `/api/v1/city-health` is implemented inline in `main.py`, very large, not service-layered, hard to test, and uses neutral fake-looking fallback scores of 50 when data is missing.
- `/api/v1/city-health` uses TimescaleDB `time_bucket`, so it will fail on a plain Postgres database.
- AQI sparkline appears to average raw component values, not normalized AQI scores, so chart units are meaningless.
- `/api/v1/city-stats` counts active sensors and unacknowledged alerts only; no freshness or severity breakdown.

### Auth - `/api/v1/auth`

File: `apps/api/app/api/v1/endpoints/auth.py`

Endpoints:
- `POST /register`
- `POST /login`
- `POST /refresh`
- `POST /logout`
- `PATCH /me/plan`
- `GET /me`

Problems:
- Coupon upgrade is hardcoded to `SMARTCITY100 -> pro`.
- No email verification, password reset, account lockout, or rate limiting.
- Refresh token rotation exists, but imported `utc_now` is unused in login.
- Frontend incorrectly expects API key endpoints under `/auth/api-keys`; they do not exist.

### Sensors - `/api/v1/sensors`

File: `apps/api/app/api/v1/endpoints/sensors.py`

Endpoints:
- `GET /`
- `GET /{sensor_id}`
- `GET /{sensor_id}/latest`
- `GET /{sensor_id}/history`
- `GET /{sensor_id}/stats`
- `GET /{sensor_id}/heatmap`
- `GET /{sensor_id}/distribution`
- `POST /{sensor_id}/simulate`

Problems:
- `latest` returns empty metrics for unknown sensors instead of 404 because it only checks Redis.
- History applies plan limits for optional auth, but most frontend calls do not pass tokens, so even paid users may get free limits in some contexts.
- History caps all results at 1000 rows without telling the client.
- Stats returns every active metric definition for a sensor, including metrics with no readings for that sensor.
- Distribution can mis-bucket max values at bucket index `buckets`, which is outside the emitted bucket range.
- Simulation is not a real simulation; it only computes diffs from adjusted numbers.

### Alerts - `/api/v1/alerts`

File: `apps/api/app/api/v1/endpoints/alerts.py`

Endpoints:
- `GET /`
- `POST /{alert_id}/acknowledge`

Problems:
- Listing alerts requires any authenticated user, not only operators/admins.
- Acknowledge requires RBAC helper permission, which frontend does not consistently model.
- No create/update/delete endpoints for alert definitions, thresholds, or severities.
- No pagination beyond hard limit 100.

### Reports - `/api/v1/reports`

File: `apps/api/app/api/v1/endpoints/reports.py`

Endpoints:
- `POST /`
- `GET /me`
- `GET /public`
- `GET /`
- `PATCH /{report_id}`

Problems:
- `list_all_reports` parameter is `status_filter`, but frontend sends `?status=...`; filtering will not work unless FastAPI happens to match by parameter name. It currently will not use `status`.
- No report detail endpoint.
- No delete endpoint.
- No validation of report status transitions.
- Public reports expose all reports without privacy/location controls.
- MinIO upload path uses original filename directly.

### Admin - `/api/v1/admin`

File: `apps/api/app/api/v1/endpoints/admin.py`

Endpoints:
- `GET /users`
- `POST /users`
- `GET /sensors`
- `POST /sensors`
- `DELETE /sensors/{sensor_id}`
- `GET /hubs`
- `POST /hubs`

Problems:
- Backend requires admin for all endpoints, but frontend allows operator access to the admin page.
- `create_user` ignores role/plan fields if `UserCreate` does not include them or if UI does not send them.
- No update endpoints for users, sensors, hubs.
- No soft-delete for sensors; delete is destructive.
- Hub model is exposed but not used by most frontend features.

### Metrics - `/api/v1/metrics`

File: `apps/api/app/api/v1/endpoints/metrics_endpoints.py`

Endpoints:
- `POST /`
- `GET /`
- `GET /{metric_id}`
- `PATCH /{metric_id}`
- `DELETE /{metric_id}`

Problems:
- Create/update/delete are admin-only, but there is no frontend management UI.
- Metric deletion can break readings/relationships unless database constraints handle it.
- Public list is unauthenticated, while maps metric list exists separately.

### Map markers - `/api/v1/map`

File: `apps/api/app/api/v1/endpoints/map_endpoints.py`

Endpoints:
- `GET /markers`

Problems:
- Returns active sensors and latest Redis readings only.
- No DB fallback for latest readings.
- No filtering by bbox, type, status, metric, or freshness.
- Response model is `list[dict]`, not a typed schema.

### Maps - `/api/v1/maps`

Files:
- `apps/api/app/routers/maps.py`
- `apps/api/app/routers/forecast.py`

Endpoints:
- `GET /metrics`
- `GET /layers/{metric_key}`
- `GET /layers/{metric_key}/history`
- `GET /layers/{metric_key}/forecast`

Problems:
- These are mounted separately from `api.v1.routes`, not in the central v1 router. This is easy to miss.
- `/layers/{metric_key}` has Redis plus DB fallback, but only looks back 24h.
- `/history` requires `from` and `to`; frontend constructs these manually.
- `/history` interpolates SQL interval with `text(f"'{interval}'::interval")`; regex helps but this should still be centralized.
- Forecast uses Prophet inside request flow. This is heavy for API requests.
- Forecast gathers tasks over the same `AsyncSession` concurrently, which is unsafe in SQLAlchemy async sessions.
- Forecast cache key ignores `hours_ahead`, so a cached 24h forecast can be returned for a later 72h request.
- Forecast relies on `sensor_readings_hourly` continuous aggregate existing.

### Analytics - `/api/v1/analytics`

File: `apps/api/app/api/v1/endpoints/analytics.py`

Endpoints:
- `GET /sensors/{sensor_id}/history`
- `GET /export`
- `GET /aggregate`
- `GET /correlations`

Problems:
- History/export/aggregate require paid plan through `track_usage`.
- `/export` duplicates newer `/api/v1/export/sensors`.
- `/export` returns CSV lines inside JSON response, not a file stream.
- `/correlations` is unauthenticated and potentially expensive.
- Correlation calculation flattens metric values across sensors and time and aligns by list order, not shared timestamps. Results can be wrong.
- Frontend scatter plot calls a nonexistent global sensor history endpoint.

### Export - `/api/v1/export`

File: `apps/api/app/api/v1/endpoints/export.py`

Endpoints:
- `GET /preview`
- `GET /sensors`

Problems:
- Rate limiting and daily row limits are in-memory dictionaries. They reset on restart and do not work across multiple instances.
- `district` is implemented as `Sensor.type == district`, not a district.
- Preview count query joins a subquery incorrectly/suspiciously by referencing `metric_subq` columns without an explicit join in the inner select. This may produce bad SQL or wrong counts.
- Free plan allows aggregated exports, paid plan allows raw/1min/parquet. This is not consistently explained across UI.
- Parquet depends on `pyarrow` being installed; if missing, runtime 500.
- No audit/export job records.
- Large exports are synchronous request/response.

### Developer/API keys - `/api/v1/developer`

File: `apps/api/app/api/v1/endpoints/api_keys.py`

Endpoints:
- `POST /keys`
- `GET /keys`
- `DELETE /keys/{key_id}`
- `GET /keys/{key_id}/usage`
- `PATCH /keys/{key_id}` admin only

Broken with frontend:
- Frontend calls `/auth/api-keys`, not `/developer/keys`.
- Frontend expects `full_key`; backend returns `key`.
- Frontend expects usage shape with `daily` and `endpoints`; backend returns summary fields.

Problems:
- User can create any tier accepted by constants unless plan checks are elsewhere.
- Delete actually revokes by setting `is_active=False`, good, but endpoint name says delete.
- Usage error rate uses SQLAlchemy `func.cast(..., func.Integer())`, which is suspicious; should use proper SQLAlchemy `Integer`.

### Intelligence - `/api/v1/intelligence`

File: `apps/api/app/routers/intelligence.py`

Endpoints:
- `POST /analyze`
- `GET /briefing`
- `GET /suggestions`

Broken:
- `analyze` asks Groq/OpenAI-compatible API for `response_format={"type": "json_object"}` but then requires the parsed result to be a JSON array. JSON object mode usually returns an object, so this can systematically fail unless the provider ignores the response format.

Problems:
- Depends on `GROQ_API_KEY`. Without it, analyze returns 500 and briefing falls back.
- LLM output is only lightly validated.
- Cached suggestions are keyed by bbox hash and analysis type, not metric set.
- `get_suggestions` only returns cached analysis. It does not compute anything.
- Prompts and model choice are hardcoded.

### Chatbot - `/api/v1/chatbot`

File: `apps/api/app/routers/chatbot.py`

Endpoints:
- `POST /message`
- `GET /suggestions`

Problems:
- Requires auth.
- Depends on Groq; without it, message endpoint 500s.
- SSE is custom and frontend-specific.
- Suggestions are hardcoded and use stale page/metric names.
- Context collection uses Redis `keys("intelligence:*")`, which can be dangerous in production.
- Marrakech local timezone is hardcoded as UTC+1. Morocco changes time policy around Ramadan; this should use an actual timezone database.

### Public API - `/public/v1`

File: `apps/api/app/routers/public_api.py`

Endpoints:
- `GET /sensors`
- `GET /sensors/{sensor_id}/readings`
- `GET /metrics`
- `GET /layers/{metric_key}`
- `GET /intelligence/latest`
- `GET /status`

Problems:
- This is the real API-key product, but frontend docs mostly point at `/api/v1`.
- `public_layer_data` contains a `pass` for `max_metrics`, so max metric restrictions are not enforced there.
- Public layer data has no DB fallback; only Redis latest.
- Public status is unauthenticated, unlike most public API routes.

### Anomalies - `/api/v1/anomalies`

File: `apps/api/app/api/v1/endpoints/anomalies.py`

Endpoints:
- `GET /`

Problems:
- No frontend page uses it.
- If `sensor_type` filters to no sensors, query uses `IN []`; behavior depends on SQLAlchemy dialect.
- No detail endpoint, no acknowledgement, no link to alerts.

### WebSockets - `/ws/{channel}`

File: `apps/api/app/core/websocket_handler.py`

Channels:
- `sensors`
- `alerts`
- `reports`

Problems:
- No authentication.
- `disconnect` uses list `.remove`; if connection is missing, it can raise.
- Subscribes to Redis keyspace notifications, which require Redis config support.
- Only seismic events are broadcast to alerts via a specific Redis channel.
- Report channel exists but no code found broadcasting report events.

## Frontend-to-Backend Connections

### Working or mostly working

- Auth register/login/refresh/logout/me: frontend API client matches backend.
- Coupon apply: frontend `/auth/me/plan` matches backend, but it is fake billing.
- Sensor list/get/latest/history/stats/heatmap/distribution/simulate: paths mostly match. Plan/auth behavior is inconsistent.
- Map markers: `/api/v1/map/markers` matches.
- Maps metrics/layers/history/forecast: paths match because routers are mounted directly in `main.py`.
- Reports create/my/public/list/update: paths mostly match; list status query name mismatch exists.
- Alerts list/acknowledge: paths match, but permissions can fail.
- City health/city stats: frontend paths match.
- ExportPanel preview/download: paths match `/api/v1/export`.
- Chatbot message/suggestions: paths match.
- WebSocket base `/ws/{channel}` matches backend.

### Broken

- Account API keys: frontend `/api/v1/auth/api-keys` does not exist.
- Developer API keys: frontend `/api/v1/auth/api-keys` does not exist.
- Developer key usage: frontend expects wrong endpoint and wrong response shape.
- Developer live tester: sends key prefix instead of real key.
- Developer docs: document `/api/v1` internal routes as API-key routes; actual API-key routes are `/public/v1`.
- Analytics scatter plot: frontend calls `/api/v1/sensors/history`, which does not exist.
- Sensor page report form: sends `0,0` location.
- Map marker click: drawer connection is defeated by navigation to full sensor page.
- AI analyze: backend response-format/array mismatch can cause 502s.
- Forecast cache: frontend can request different `hours_ahead`, backend cache ignores it.

### Missing

- No `/analytics` landing page even though `/analytics/correlations` links to it.
- No "my reports" page despite dashboard claiming it.
- No frontend for anomalies.
- No frontend for metric management.
- No frontend for user creation despite admin API method.
- No real billing/subscription flow.
- No export job history backend.
- No alert rules/threshold management UI.
- No robust readiness endpoint.
- No API schema-generated frontend client.

## Current UI/UX Problems

### Inconsistent design

- Every page builds its own header/nav.
- Navigation items differ by page and role with no shared app shell.
- Cards are everywhere, often with large radius/shadow, making the app feel like a prototype.
- Dark mode is partial and inconsistent.
- Buttons, tabs, selects, and status chips vary across pages.
- Emoji icons are used in serious surfaces.
- Landing page styling conflicts with operations dashboard styling.

### Missing states

- Many API calls swallow errors and render empty UI.
- Empty states rarely say whether there is no data, no permission, or the API failed.
- Data freshness is mostly absent.
- Loading is inconsistent: some pages have skeletons, others just text.
- Permission denied is often indistinguishable from empty data.

### Poor component boundaries

- Large pages own too much behavior (`developer/page.tsx`, `maps/[metric]/page.tsx`).
- Map components directly manipulate DOM and duplicate search pin logic.
- API calls are split between `api.ts` and direct `fetch`.
- AuthProviders are repeatedly nested in individual pages instead of one clear app-level provider strategy.
- Export exists in two implementations/concepts: analytics export and newer export panel.

### Operational UX gaps

- No global app shell, breadcrumbs, or persistent role-aware nav.
- No central alert center.
- No clear distinction between live, stale, forecast, simulated, and AI-generated data.
- No audit trail for admin/report/export operations.
- No unified sensor detail model.
- No filters for map by status/type/freshness/metric availability.

## What The App Should Look Like

The app should look like a mature smart-city operations product:

- A single app shell with consistent top nav/sidebar, role-aware sections, and clear active routes.
- Primary live map as the operational center, with layer controls, filters, freshness indicators, alerts, and sensor drawer that does not fight navigation.
- Thematic maps as analysis tools, not separate experimental demos.
- Sensor detail pages that show live/latest/stale status, historical trends, anomalies, alerts, maintenance, QR, and report linkage using the real sensor coordinates.
- Citizen reporting as a focused workflow with location, category, photo, status tracking, and a real "my reports" page.
- Admin as a proper management console with permissions, CRUD flows, validation, search, pagination, and error display.
- Developer portal generated from real OpenAPI/public API contracts, using real full API keys only once, with accurate public endpoint docs and real usage charts.
- Export as one workflow, backed by server-side export jobs/audit records, not duplicate pages and in-memory limits.
- AI features clearly labeled with source, freshness, cache state, and failure state.

## What It Currently Looks Like

The current app looks like a feature demo:

- A marketing hero page first.
- Multiple map experiences that are powerful but fragmented.
- Many features are present but only half wired.
- Several pages hide backend failures.
- Some UI claims production-grade concepts (billing, API docs, usage analytics, AI intelligence, simulation) that are not actually implemented at that level.
- Frontend and backend contracts have drifted.

## Highest-Risk Refactor Areas

1. API contract drift: fix endpoint paths and response shapes first, especially developer API keys, analytics scatter, reports filters, and public API docs.
2. App shell and navigation: create one coherent role-aware shell.
3. Map behavior: decide whether sensor click opens drawer or navigates; make it consistent.
4. Data freshness/errors: stop swallowing errors and show real state.
5. Export/developer portals: consolidate duplicated and broken surfaces.
6. AI features: make Groq dependency, cache, freshness, and failure explicit.
7. Backend service layering: move large inline logic from `main.py` and routers into testable services.

