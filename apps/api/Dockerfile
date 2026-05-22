FROM python:3.12-slim AS builder

WORKDIR /app
ENV PIP_DEFAULT_TIMEOUT=600
ENV PIP_RETRIES=10
RUN pip install --retries 10 --timeout 600 poetry
ENV POETRY_HTTP_TIMEOUT=600

COPY packages/shared /app/packages/shared
COPY packages/database /app/packages/database
COPY packages/auth /app/packages/auth
COPY packages/observability /app/packages/observability
COPY apps/api /app/apps/api

WORKDIR /app/apps/api
RUN poetry config virtualenvs.create false && poetry install --no-interaction --no-ansi

EXPOSE 8000

CMD ["poetry", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
