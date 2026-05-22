# Urban Pulse — Project Context

## What this is

Urban Pulse is a real-time city intelligence platform built for Marrakech, Morocco.
It started as a hackathon project and evolved into a full city intelligence OS.

It collects sensor data from across the city, visualizes it on a live interactive map,
forecasts future values using ML, detects anomalies automatically, explains patterns
through AI, and exposes a public developer API for researchers and third parties.

---

## Who uses it

| User | What they care about |
|---|---|
| **City operators** | Live alerts, anomaly detection, actionable AI recommendations |
| **Hackathon judges** | Wow factor, technical depth, real-world impact, demo reliability |
| **Urban researchers** | Data export, historical playback, correlation analysis, API access |
| **Citizens** | Air quality, temperature, seismic safety in their district |

When making UI and UX decisions, optimize in this order: judges first (it's a hackathon), operators second, researchers third.

---

## What was already built

- Real-time sensor pipeline (RabbitMQ → Worker → TimescaleDB)
- WebSocket live updates to the frontend
- MapLibre GL JS map with IDW interpolation surface (replaces Leaflet)
- Thematic map layers per metric with live WebSocket updates
- TimescaleDB continuous aggregates (hourly + daily pre-computed averages)
- Historical playback with timeline slider (Live / History / Forecast modes)
- Prophet-based forecasting with confidence bands, cached in Redis
- LLM intelligence layer (Groq / Llama 3) — colored circles on map per analysis type
- Future City page — all metrics on one map with auto-running AI analysis
- API key system — developer portal, free/researcher/enterprise tiers, rate limiting, usage analytics
- In-app chatbot "Pulse AI" — context-aware, streams responses, proactive alert notifications
- Full rebrand to Urban Pulse — new color palette, glassmorphism cards, city skyline landing page
- Seismic detection with full-screen emergency modal + audio alert
- Address search bar (Nominatim, no API key)
- Night mode toggle persisted across sessions
- Custom emoji map markers per metric category
- Sensor detail page navigation on marker click
- RBAC: Admin / Operator / Citizen roles
- Prometheus + Grafana monitoring

---

## What was just completed (Phase 1 & 2)

- GeoJSON circle layers replacing all DOM Marker() calls — pulse animation, status colors, value labels
- Hover tooltips and flyTo click navigation on all map layers
- 44px mobile touch targets
- MapLibre cluster mode
- 90-day historical data seeder with diurnal patterns, seasonal variation, anomaly events
- Hourly live seed cron via GitHub Actions
- New sensor types: UV index, traffic density, energy grid load, dust storm index

---

## What still needs to be built

See `tasks.md` — Phases 3 through 6 and pitch polish items P.2 and P.3.

Short version: charts & analytics, AI briefing, anomaly detection, scenario simulator,
split-screen comparison, public reports, mobile layout, deployment, CI/CD, demo mode, README.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, MapLibre GL JS, Recharts |
| Backend | Python 3.12, FastAPI, async SQLAlchemy, asyncpg |
| Database | TimescaleDB (PostgreSQL 16) |
| Cache / pub-sub | Redis |
| Message bus | RabbitMQ |
| Object storage | MinIO |
| AI / LLM | Groq API (Llama 3, free tier) |
| Forecasting | Prophet |
| Geocoding | Nominatim (free, no key) |
| Monitoring | Prometheus + Grafana |
| Deployment | Railway (backend), Vercel (frontend) |
| CI/CD | GitHub Actions |

---

## Marrakech-specific details

- City is divided into districts: Medina, Gueliz, Menara, Agdal, Sidi Youssef Ben Ali, Palmeraie
- Climate: hot semi-arid — very hot dry summers, mild winters, occasional dust storms
- Diurnal temperature range is large (15–20°C swing between night and day in summer)
- Rush hours: 08:00–09:30 and 18:00–20:00
- Major public space: Jemaa el-Fna (used in scenario simulator)
- Major road: Avenue Mohammed VI (used in scenario simulator)
- Coordinates center: approximately 31.6295° N, 8.0084° W

---

## Tone and design language

- Professional but approachable — this is civic infrastructure, not a toy
- Dark mode is the primary aesthetic (night-* color tokens)
- Glassmorphism cards with backdrop blur on the hero and key UI elements
- Data-dense but never cluttered — every element earns its place
- Emergency states (seismic) are unmistakably urgent — full-screen modal, audio alert
- The platform should feel like a Bloomberg terminal crossed with a city control room