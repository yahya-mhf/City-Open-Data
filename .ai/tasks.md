# Urban Pulse — Autonomous Task System

## READ BEFORE DOING ANYTHING
1. Read `.ai/context.md` — understand the project, its audience, and Marrakech specifics
2. Read `.ai/rules.md` — mandatory constraints and patterns
3. Read `.ai/architecture.md` — system layout, data flows, failure modes
4. Read `.ai/workflow.md` — how to execute tasks correctly
5. Read `.ai/standards.md` — code style and component patterns
6. Search the codebase for the most similar existing implementation before writing anything new

You are the lead engineer. Work autonomously and deeply.
Do not stop at shallow implementations.
Do not ask for confirmation on routine engineering decisions.
A task is only done when it is production-ready, integrated, typed, and tested.

After completing each task:
- Mark it ✅
- Note anything unexpected or broken in the session notes below
- Inspect the surrounding systems for regressions
- Remove any dead code introduced during the work
- Continue to the next task unless instructed otherwise

---

## Progress

**15 / 24 tasks complete**

Status: ✅ Done | 🔄 In Progress | ❌ Not Started

---

## 🔴 Phase 1 — Bug Fixes

- ✅ **1.1** Replace `Marker()` with GeoJSON circle layers (pulse ring, dot, value label)
- ✅ **1.2** Hover tooltip on sensor markers (name, value+unit, status badge, timestamp)
- ✅ **1.3** Click sensor → flyTo animation → navigate to `/sensors/[id]`
- ✅ **1.4** 44×44px invisible hit area layer for mobile touch targets
- ✅ **1.5** MapLibre cluster mode (color by count: blue <10, amber 10–50, red 50+, click to expand)

---

## 🗄️ Phase 2 — Data Seeding

- ✅ **2.1** `seed_historical.py` — 90 days synthetic data with diurnal patterns, seasonal variation, and anomaly events
- ✅ **2.2** `.github/workflows/seed-live.yml` — hourly cron calling `/internal/seed-latest` with `INTERNAL_SECRET`
- ✅ **2.3** New sensor types: UV index, traffic density, energy grid load, dust storm index — all 9 locations updated

---

## 📊 Phase 3 — Charts & Analytics

- ❌ **3.1** Sensor detail page charts
  - 7-day time series with forecast overlay (dashed) and confidence band (shaded area)
  - 24-hour heatmap grid (hour × weekday, average value per cell)
  - Distribution histogram of readings this month
  - Stats row: current / 24h avg / monthly record / status
  - Loading skeletons on all charts while data fetches
  - Full dark mode support

- ❌ **3.2** Correlation heatmap at `/analytics/correlations`
  - Pearson correlation between every sensor type pair (last 30 days)
  - D3 N×N grid: blue (negative) → white (zero) → red (positive)
  - Click cell → scatter plot modal (Recharts)
  - FastAPI endpoint: `GET /api/v1/analytics/correlations`

- ❌ **3.3** City health scorecard on landing page
  - Air Quality Index (CO2 + dust + UV weighted average)
  - Heat Stress Index (temperature + humidity combination)
  - Urban Livability Score (all sensor types normalized 0–100)
  - Each card: score, trend arrow vs yesterday, status color, 24h sparkline
  - FastAPI endpoint: `GET /api/v1/city-health` — cached in Redis 5 min TTL

- ❌ **3.4** Data export page at `/export`
  - Filters: sensor type, district, date range
  - Record count preview (debounced 300ms) before download
  - Export buttons: CSV, JSON, GeoJSON
  - FastAPI streaming endpoints: `GET /api/v1/export/{format}`
  - Rate limits using existing API key tier system (free: 1k rows/day, researcher: 100k, enterprise: unlimited)
  - Download history table for the current user

---

## 🤖 Phase 4 — AI & Forecasting

- ❌ **4.1** Daily AI morning briefing
  - Cron job at 06:00 Marrakech time calls Groq (Llama 3)
  - Prompt includes last 24h sensor summaries + anomaly events
  - Output: 3 paragraphs (overnight recap, today's risks, one action recommendation)
  - Cached in Redis, 6-hour TTL
  - Frontend: typewriter streaming effect, generation timestamp shown
  - Displayed on landing page below the hero

- ❌ **4.2** Multi-sensor Prophet forecasting
  - Identify top 3 correlated sensor types per target metric (from correlation matrix)
  - Pass them as additional regressors to Prophet
  - Add time-of-day and day-of-week as regressors
  - Forecast response includes: regressor names used, importance weights
  - Map forecast overlay shows "multi-sensor" or "single-sensor" label

- ❌ **4.3** Real-time anomaly detection worker
  - Rolling Z-score over last 24 hours per sensor reading
  - Flag WARNING if |Z| > 2, CRITICAL if |Z| > 3
  - IQR outlier detection as second pass
  - If both methods agree → fire alert via existing RabbitMQ alerts queue
  - Store in `anomaly_events` TimescaleDB table
  - Endpoint: `GET /api/v1/anomalies?since=&sensor_type=`

- ❌ **4.4** What-if scenario simulator at `/simulate`
  - City map with current IDW surface
  - Sidebar sliders: tourist volume in Medina, Avenue Mohammed VI traffic, temperature deviation, Jemaa el-Fna event toggle
  - "Run Simulation" → FastAPI → Groq prompt with current data + scenario → parsed JSON impact per sensor type
  - IDW surface re-rendered with simulated values in distinct overlay color

---

## 🎨 Phase 5 — UI/UX

- ❌ **5.1** Split-screen map comparison mode
  - "Compare" toggle button on all thematic map pages
  - Two side-by-side MapLibre instances, cameras linked (sync-move)
  - Left: current period. Right: date/time picker for comparison period
  - Floating delta legend showing difference between periods

- ❌ **5.2** Public report pages at `/report/[district]/[date]`
  - No login required
  - Key stats + time series per sensor type + anomaly log + AI summary paragraph
  - Share button (copies URL), Download PDF button (browser print API)
  - Cache-Control: public, max-age=3600

- ❌ **5.3** Mobile-first map layout
  - Bottom sheet (50% height, draggable) replaces sidebar on < 768px
  - Bottom navigation bar: Map / Analytics / Alerts / Pulse AI / Profile
  - Layer selector: horizontally scrollable pill row at top of map
  - Pulse AI: full-screen overlay on mobile instead of side panel
  - All touch targets ≥ 44×44px

---

## 🚀 Phase 6 — Deployment & CI/CD

- ❌ **6.1** Railway deployment
  - `railway.toml` created
  - `docker-compose.yml` Railway-compatible
  - Services: api, web, timescaledb, redis, rabbitmq
  - Env var groups configured: DATABASE_URL, REDIS_URL, RABBITMQ_URL, GROQ_API_KEY, INTERNAL_SECRET
  - Railway deploy button added to README

- ❌ **6.2** GitHub Actions CI/CD pipeline
  - `test` job: pytest (backend) + jest (frontend) on every push
  - `build` job: Docker images pushed to ghcr.io
  - `deploy` job: Railway webhook (backend) + Vercel hook (frontend) on push to `main`
  - `seed` job: scheduled hourly, calls `/internal/seed-latest`
  - Status badges in README

- ❌ **6.3** Environment variable audit
  - All hardcoded values moved to env vars
  - `.env.example` with all required vars and descriptions
  - `.env.local.example` for Next.js frontend
  - Pydantic Settings validation in `config.py` — fails fast on missing vars
  - "Configuration" section added to README

---

## 🏆 Hackathon Pitch Polish

- ✅ **P.1** Landing page hero redesign (fullscreen map, glassmorphism overlay, live sensor count + alert count)

- ❌ **P.2** Demo mode toggle
  - Visible to all users in top navbar
  - On activation: triggers seismic alert modal after 10s, CO2 spike in Medina on map, Pulse AI proactively warns about CO2
  - Auto-resets after 60 seconds
  - Purpose: reliable wow moment during live hackathon demo

- ❌ **P.3** README hackathon submission rewrite
  - Hero banner (screenshot placeholder)
  - One-paragraph elevator pitch
  - Mermaid architecture diagram
  - Feature list with screenshot placeholders
  - Tech stack table
  - Local setup in ≤ 5 commands
  - Live demo link + API docs link
  - Team section

---

## Session notes

> Record discoveries, blockers, and unexpected findings here after each session.

- Phases 1 and 2 complete. Markers now use GeoJSON layers with pulse animation.
- Historical seeder generates 90 days of realistic data with diurnal patterns and anomaly events.
- UV index, traffic density, energy grid load, and dust storm index added across all 9 required locations.
- Landing page hero redesigned with fullscreen MapLibre background, glassmorphism card, live counts.

---

## Continue iterating until

- No obvious weaknesses remain in the area you touched
- Implementation is production-grade across backend, frontend, and data layers
- Surrounding systems are coherent and no regressions introduced