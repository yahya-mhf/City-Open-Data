.PHONY: install-dev build up down test lint format clean

install-dev:
	pip install poetry
	cd packages/shared && poetry install
	cd packages/database && poetry install
	cd packages/auth && poetry install
	cd packages/observability && poetry install
	cd apps/api && poetry install
	cd apps/worker && poetry install
	cd apps/simulator && poetry install
	cd apps/web && npm install

build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down

test:
	cd apps/api && poetry run pytest
	cd apps/worker && poetry run pytest
	cd apps/simulator && poetry run pytest

test-web:
	cd apps/web && npm test

lint:
	cd apps/api && poetry run ruff check .
	cd apps/worker && poetry run ruff check .
	cd apps/simulator && poetry run ruff check .
	cd packages/shared && poetry run ruff check .
	cd packages/database && poetry run ruff check .
	cd packages/auth && poetry run ruff check .
	cd packages/observability && poetry run ruff check .

format:
	cd apps/api && poetry run ruff format .
	cd apps/worker && poetry run ruff format .
	cd apps/simulator && poetry run ruff format .
	cd packages/shared && poetry run ruff format .
	cd packages/database && poetry run ruff format .
	cd packages/auth && poetry run ruff format .
	cd packages/observability && poetry run ruff format .

clean:
	Find-Object -Path . -Include '__pycache__', '.pytest_cache', '*.egg-info', 'node_modules', '.next' -Recurse -Directory | ForEach-Object { Remove-Item -Recurse -Force $_.FullName }

migrations:
	cd apps/api && poetry run alembic upgrade head

seed:
	cd apps/api && poetry run python -m app.scripts.seed
