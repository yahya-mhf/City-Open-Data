import json
from datetime import datetime, timezone
from typing import Any


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def serialize_datetime(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def json_dumps(data: dict[str, Any]) -> str:
    return json.dumps(data, default=str)


def json_loads(data: str) -> dict[str, Any]:
    return json.loads(data)
