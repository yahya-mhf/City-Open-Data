# Urban Pulse — Task List

> Work through top to bottom. Check off as you go.

Status: ✅ Done  |  🔄 In Progress  |  ❌ Not Started

---

## 🔴 Phase 1 — Bug Fixes

- [x] **1.1** Replace `Marker()` with GeoJSON circle layers (pulse ring, dot, label)
- [x] **1.2** Hover tooltip on sensor markers (name, value, status, timestamp)
- [x] **1.3** Click sensor → flyTo animation → navigate to `/sensors/[id]`
- [x] **1.4** 44×44px invisible hitarea for mobile touch targets
- [x] **1.5** MapLibre cluster mode (color by count, click to expand)

## 🗄️ Phase 2 — Data Seeding

- [x] **2.1** `seed_historical.py` — 90 days synthetic data with diurnal/seasonal patterns
- [x] **2.2** `.github/workflows/seed-live.yml` — hourly cron + `/internal/seed-latest`
- [x] **2.3** New sensor types: UV index, traffic density, energy grid load, dust storm index

## 📊 Phase 3 — Charts & Analytics

- [ ] **3.1** Sensor detail page: 7-day forecast chart, 24h heatmap, histogram, stats row
- [ ] **3.2** Correlation heatmap at `/analytics/correlations` (D3 + Recharts)
- [ ] **3.3** City health scorecard on landing page (AQI, heat stress, livability)
- [ ] **3.4** Data export page at `/export` (CSV/JSON/GeoJSON, rate-limited)

## 🤖 Phase 4 — AI & Forecasting

- [ ] **4.1** Daily AI morning briefing (Groq, 06:00 cron, Redis cache, typewriter effect)
- [ ] **4.2** Multi-sensor Prophet forecasting with regressors and importance weights
- [ ] **4.3** Real-time anomaly detection (rolling Z-score + IQR, RabbitMQ alerts)
- [ ] **4.4** Scenario simulator at `/simulate` (Groq-powered what-if predictions)

## 🎨 Phase 5 — UI/UX

- [ ] **5.1** Split-screen map comparison mode (sync-move, date picker, delta legend)
- [ ] **5.2** Public report pages at `/report/[district]/[date]` (no login, share, PDF)
- [ ] **5.3** Mobile-first map layout (bottom sheet, nav bar, 44px touch targets)

## 🚀 Phase 6 — Deployment & CI/CD

- [ ] **6.1** `railway.toml` + Railway-compatible docker-compose
- [ ] **6.2** GitHub Actions CI/CD pipeline (test, build, deploy)
- [ ] **6.3** Env var audit: `.env.example`, `.env.local.example`, Pydantic Settings validation

## 🏆 Hackathon Pitch Polish

- [x] **P.1** Landing page hero redesign (fullscreen map, glassmorphism, live counts)
- [ ] **P.2** Demo mode toggle (fake seismic alert, CO2 spike, chatbot trigger)
- [ ] **P.3** README hackathon submission rewrite (Mermaid diagram, screenshots, team)

---

**Progress:** 9 / 24 tasks completed
