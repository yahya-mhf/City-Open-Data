FROM python:3.12-slim AS builder

WORKDIR /app
RUN pip install --upgrade pip
RUN pip install poetry

COPY packages/shared /app/packages/shared
COPY apps/simulator /app/apps/simulator

WORKDIR /app/apps/simulator
RUN poetry config virtualenvs.create false && poetry install --no-interaction --no-ansi

CMD ["poetry", "run", "python", "-m", "app.main"]
