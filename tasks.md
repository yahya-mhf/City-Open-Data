# Urban Pulse — AI Coder Prompt Playbook
> Work through these top to bottom. Each prompt is self-contained — paste it directly into Claude Code / Cursor. Check off as you go.

---

## 🔴 Phase 1 — Bug Fixes (do these first)

### 1.1 Fix sensor marker visibility
```
In our MapLibre GL JS map, replace all `new Marker()` calls with GeoJSON circle layers. Each sensor point should have: a large circle (radius 14px), a pulsing outer ring animation using a second circle layer scaled with a CSS keyframe, color driven by sensor status (green=normal, amber=warning, red=critical), and a white label showing the current value centered on the dot. Apply to all thematic map layers.
```

### 1.2 Hover tooltip
```
Add hover interactivity to the sensor GeoJSON layer in MapLibre. On mouseenter: show a floating popup with sensor name, current value+unit, status badge, and last updated time. On mouseleave: remove the popup. Change cursor to pointer on hover. Match our existing Tailwind dark-mode color palette.
```

### 1.3 Click to navigate
```
When a user clicks a sensor marker on the MapLibre map, trigger a smooth flyTo() animation centering on that sensor at zoom 15, wait 600ms, then navigate to `/sensor/[id]` using Next.js router.
```

### 1.4 Mobile tap targets
```
Add an invisible transparent circle layer on top of every sensor marker in MapLibre with a minimum radius of 22px, so small markers are easy to tap on touchscreens. This should not affect visual appearance.
```

### 1.5 Cluster nearby sensors
```
Enable MapLibre cluster mode on the sensor GeoJSON source. Clusters of <10 sensors show a blue circle with count, 10–50 show amber, 50+ show red. Clicking a cluster zooms in and expands it. Individual markers appear once zoom > 14.
```

---

## 🗄️ Phase 2 — Data Seeding

### 2.1 Generate synthetic historical data
```
Write a Python script `seed_historical.py` that inserts 90 days of synthetic sensor readings into our TimescaleDB `sensor_readings` table. Requirements:
- Realistic diurnal patterns: temperature peaks at 14:00, CO2 spikes at 08:00 and 18:00 (rush hour), rainfall only at night in winter months
- Seasonal variation using sine wave offsets
- Random anomaly events: 3–5 per sensor per month, values 2–3 standard deviations from mean, lasting 1–4 hours
- One reading per sensor every 10 minutes
- Use our existing DATABASE_URL env var and the asyncpg library
Run with: `python seed_historical.py --days 90`
```

### 2.2 Hourly live data cron
```
Add a GitHub Actions workflow `.github/workflows/seed-live.yml` that runs every hour and calls our FastAPI endpoint `POST /internal/seed-latest` to inject a fresh batch of sensor readings, so the platform always looks live even when no real sensors are connected. Secure the endpoint with an `INTERNAL_SECRET` header checked against an env var.
```

### 2.3 Expand sensor types
```
Add the following new sensor types to our platform (backend model, seed data, and frontend layer):
- UV index (0–11 scale, peaks midday)
- Traffic density (vehicles/min, peaks 08:00 and 18:00)
- Energy grid load (MW, correlates with temperature)
- Relative humidity (%, inversely correlates with temperature for Marrakech climate)
- Dust storm index (Marrakech-specific, 0–5 scale, spikes on hot dry afternoons)
Follow the existing sensor type pattern in the codebase.
```

---

## 📊 Phase 3 — Charts & Analytics

### 3.1 Sensor detail page charts
```
On the `/sensor/[id]` page, add the following charts using Recharts:
1. 7-day time series line chart with the forecast overlay (dashed line) and confidence band (shaded area)
2. 24-hour heatmap grid (hour of day × day of week) showing average values by cell
3. Distribution histogram of all readings this month
4. "Current vs average vs record" stat row at the top
All charts should support dark mode and show a loading skeleton while data fetches.
```

### 3.2 Correlation heatmap
```
Add a correlation heatmap page at `/analytics/correlations`. It should:
- Fetch the Pearson correlation coefficient between every pair of sensor types from our TimescaleDB data (last 30 days)
- Render as an N×N grid where cell color goes from blue (negative correlation) through white (none) to red (positive correlation)
- Clicking a cell opens a scatter plot of those two sensor types in a modal
- Use D3 for the heatmap and Recharts for the scatter plot
```

### 3.3 City health scorecard
```
On the landing page, add a "City Health" scorecard section with three composite KPI cards:
1. Air Quality Index — weighted average of CO2 + dust + UV readings
2. Heat Stress Index — combination of temperature + humidity
3. Urban Livability Score — composite of all sensor types normalized 0–100
Each card shows: current score, trend arrow (vs yesterday), color-coded status (green/amber/red), and a sparkline of the last 24 hours. Compute these in a new FastAPI endpoint `GET /api/v1/city-health` and cache in Redis for 5 minutes.
```

### 3.4 Data export portal
```
Add a data export page at `/export` with:
- Dropdowns to select sensor type, district, and date range
- Record count preview that updates as filters change (debounced, 300ms)
- Three export buttons: CSV, JSON, GeoJSON
- FastAPI endpoints `GET /api/v1/export/{format}` that stream the response for large datasets
- Rate limiting: free tier = 1000 rows/day, researcher = 100k rows/day, enterprise = unlimited (use our existing API key tier system)
- A download history table showing the user's past exports
```

---

## 🤖 Phase 4 — AI & Forecasting

### 4.1 Daily AI city briefing
```
Add a "Morning Briefing" section to the landing page. Every day at 06:00 (Marrakech time), a cron job calls Groq (Llama 3) with the last 24 hours of sensor summaries and generates a 3-paragraph briefing:
- Paragraph 1: what happened overnight (anomalies, records broken)
- Paragraph 2: today's forecast risks based on predicted values
- Paragraph 3: one concrete action recommendation for city operators
Cache the result in Redis with a 6-hour TTL. Display with a typewriter streaming effect on the frontend. Show the generation timestamp.
```

### 4.2 Multi-sensor forecasting
```
Upgrade our Prophet forecasting to use multivariate inputs. For each sensor being forecast:
- Identify the top 3 correlated sensor types from our correlation matrix
- Pass their recent values as additional regressors to Prophet
- Also add time-of-day and day-of-week as regressors
- The forecast endpoint response should include which regressors were used and their importance weights
- Update the map forecast overlay to show a "confidence" label indicating if multi-sensor or single-sensor forecast was used
```

### 4.3 Anomaly detection
```
Add a real-time anomaly detection service in Python that runs as a background worker:
- For each incoming sensor reading, compute a rolling Z-score over the last 24 hours
- Flag as WARNING if |Z| > 2, CRITICAL if |Z| > 3
- Also apply IQR outlier detection as a second pass
- If both methods agree it's anomalous, fire an alert via our existing RabbitMQ alerts queue
- Store anomaly events in a new TimescaleDB table `anomaly_events`
- Expose `GET /api/v1/anomalies?since=&sensor_type=` endpoint
```

### 4.4 What-if scenario simulator
```
Add a "Scenario Simulator" page at `/simulate`. It should:
- Show the city map with current IDW interpolation surface
- Have a sidebar with scenario sliders:
  - +N thousand tourists in the Medina
  - Close/open Avenue Mohammed VI to traffic
  - Temperature deviation from forecast (±5°C)
  - Large event at Jemaa el-Fna (yes/no toggle)
- When the user clicks "Run Simulation", send the scenario parameters to a FastAPI endpoint that calls Groq with the current sensor data + scenario description, asks it to predict the environmental impact, parses the response, and returns adjusted predicted values per sensor type
- Re-render the IDW surface on the map with the simulated values overlaid in a distinct color
```

---

## 🎨 Phase 5 — UI/UX

### 5.1 Split-screen comparison mode
```
Add a "Compare" toggle button to all thematic map pages. When activated:
- The map splits into two side-by-side panes
- The left pane shows the current time period
- The right pane has a date/time picker to select a comparison period
- Both maps pan and zoom in sync (linked camera)
- A floating difference legend shows the delta between the two periods
Use MapLibre's sync-move pattern to link the two map instances.
```

### 5.2 Shareable public report pages
```
Add a public report page at `/report/[district]/[date]` (e.g. `/report/medina/2025-05-20`) that:
- Requires no login
- Shows a full-page summary of that district's sensor data for that date
- Includes: key stats, time series charts for each sensor type, any anomalies that occurred, AI-generated summary paragraph
- Has a "Share" button that copies the URL, and a "Download PDF" button using the browser print API
- Is statically cached at the CDN edge (set Cache-Control: public, max-age=3600)
```

### 5.3 Mobile-first layout
```
Redesign the mobile layout (< 768px) of the main map pages:
- Replace the sidebar with a bottom sheet that slides up from the bottom (50% height, draggable)
- Add a bottom navigation bar with icons for: Map, Analytics, Alerts, Pulse AI, Profile
- The layer selector becomes a horizontally scrollable pill row at the top of the map
- Pulse AI chatbot opens as a full-screen overlay on mobile instead of a side panel
- All touch targets must be at least 44×44px
```

---

## 🚀 Phase 6 — Deployment & CI/CD

### 6.1 Railway deployment
```
Create a `railway.toml` and update our `docker-compose.yml` to be Railway-compatible. We need the following services deployed:
- fastapi-backend (our Python API)
- nextjs-frontend
- timescaledb (PostgreSQL + TimescaleDB extension)
- redis
- rabbitmq
Set up environment variable groups in Railway for: DATABASE_URL, REDIS_URL, RABBITMQ_URL, GROQ_API_KEY, INTERNAL_SECRET. Add a Railway deploy button to the README.
```

### 6.2 GitHub Actions CI/CD pipeline
```
Create `.github/workflows/ci.yml` with the following jobs:
1. `test`: runs `pytest` for the FastAPI backend and `jest` for the Next.js frontend on every push
2. `build`: builds Docker images for backend and frontend, pushes to GitHub Container Registry (ghcr.io)
3. `deploy`: on push to `main` only — triggers Railway deploy webhook for backend, triggers Vercel deploy hook for frontend
4. `seed`: scheduled cron job every hour — calls our `/internal/seed-latest` endpoint with INTERNAL_SECRET header
Add status badges for all jobs to the README.
```

### 6.3 Environment configuration cleanup
```
Audit all hardcoded values in the codebase and move them to environment variables. Create:
- `.env.example` with all required vars and descriptions (no real values)
- `.env.local.example` for the Next.js frontend
- A `config.py` in FastAPI that loads and validates all env vars at startup using Pydantic Settings, failing fast with a clear error if any required var is missing
Document all env vars in the README under a "Configuration" section.
```

---

## 🏆 Hackathon Pitch Polish

### P.1 Landing page hero
```
Redesign the Urban Pulse landing page hero section:
- Full-screen map background (MapLibre, non-interactive, auto-rotating camera slowly panning over Marrakech)
- Glassmorphism overlay card centered with: "Urban Pulse" title, tagline "Real-time city intelligence for Marrakech", animated live sensor count and active alerts count updating every 5 seconds
- Three CTA buttons: "View Live Map", "Read API Docs", "Watch Demo"
- The daily AI briefing card displayed below the hero
- Smooth scroll to features section
```

### P.2 Demo mode
```
Add a "Demo Mode" toggle (top navbar, visible to all users) that:
- Artificially triggers a seismic alert after 10 seconds to show the emergency modal
- Simulates a CO2 spike in the Medina district on the map
- Makes the Pulse AI chatbot proactively say "⚠️ I'm detecting unusual CO2 levels near Jemaa el-Fna — want me to analyze?"
- Resets to normal after 60 seconds
This lets us trigger a wow moment during the live hackathon demo without waiting for real events.
```

### P.3 README and pitch doc
```
Rewrite the project README.md as a hackathon submission document:
- Hero banner with a screenshot
- One-paragraph elevator pitch
- Architecture diagram (described in Mermaid)
- Feature list with screenshots or GIFs (use placeholder [screenshot] tags)
- Tech stack table
- Local setup in under 5 commands
- Live demo link and API docs link
- Team section
Make it look like a winning submission.
```

---

*Total prompts: 24 — estimated implementation time with an AI coder: 2–3 focused sessions.*