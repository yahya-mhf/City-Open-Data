# Urban Pulse — Development Workflow

## How to start every session

Before writing any code, always:

1. Read `.ai/tasks.md` — understand the current objective
2. Read `.ai/rules.md` — internalize what is and isn't allowed
3. Read `.ai/architecture.md` — understand which systems are impacted
4. Search the codebase for the most similar existing implementation to the task
5. Only then begin planning and writing

---

## Execution process

For every task, follow this order:

1. **Analyze** — identify every file that needs to change
2. **Plan** — list the changes before making them
3. **Implement deeply** — no stubs, no TODOs, no partial work
4. **Validate** — run type check, lint, verify runtime imports
5. **Inspect edge cases** — empty data, loading states, error states, dark mode
6. **Refactor** — clean dead code, improve any weak architecture touched during the task
7. **Verify coherence** — surrounding systems still work correctly
8. **Update tasks.md** — mark the task done, note anything discovered

Continue iterating until no obvious weaknesses remain in the area you touched.

---

## Local development

```bash
# Start infrastructure
docker compose up -d timescaledb redis rabbitmq minio

# Start API
docker compose up -d api
docker compose logs -f api

# Start frontend
cd apps/web && npm run dev

# Seed schema + sensors + metric definitions (first time only)
docker exec sc-api-1 poetry run python -m app.scripts.seed

# Seed 90 days of historical data
docker cp seed_historical.py sc-api-1:/app/seed_historical.py
docker exec sc-api-1 python /app/seed_historical.py --days 90

# Manually trigger live seed
curl -X POST http://localhost:8000/internal/seed-latest \
  -H "INTERNAL_SECRET: your-secret"
```

**Hot reload:**
- API: uvicorn `--reload` watches `/app/apps/api` and `/app/packages`
- Frontend: Next.js fast refresh on save
- Simulator / Worker: restart container after changes

---

## Testing

```bash
# Backend
cd apps/api && poetry run pytest -v

# Frontend type check
cd apps/web && npx tsc --noEmit

# Frontend lint
cd apps/web && npm run lint

# Frontend unit tests
cd apps/web && npm test
```

---

## Branch strategy

- `main` — production-ready, auto-deployed via GitHub Actions
- `feat/<name>` — feature branches, squash-merge to main
- `fix/<name>` — bug fix branches

---

## Before merging to main

- [ ] `npx tsc --noEmit` passes
- [ ] `ruff check .` passes
- [ ] All services healthy (`docker compose ps`)
- [ ] Dark mode tested visually
- [ ] No `.env` staged
- [ ] `tasks.md` updated