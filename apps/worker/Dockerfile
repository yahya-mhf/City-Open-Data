FROM python:3.12-slim AS builder

WORKDIR /app
ENV PIP_DEFAULT_TIMEOUT=300
RUN pip install poetry
ENV POETRY_HTTP_TIMEOUT=300

COPY packages/shared /app/packages/shared
COPY packages/database /app/packages/database
COPY packages/auth /app/packages/auth
COPY packages/observability /app/packages/observability
COPY apps/worker /app/apps/worker

WORKDIR /app/apps/worker
RUN poetry config virtualenvs.create false && poetry install --no-interaction --no-ansi

EXPOSE 8001

CMD ["poetry", "run", "python", "-m", "app.main"]
