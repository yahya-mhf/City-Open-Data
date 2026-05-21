from datetime import datetime
from uuid import UUID, uuid4
from typing import Any, Literal

from pydantic import BaseModel, Field


class HubPayload(BaseModel):
    hub_id: str
    sent_at: datetime
    sensor_readings: list["SensorReadingPayload"]


class SensorReadingPayload(BaseModel):
    sensor_id: str
    timestamp: datetime
    battery: float | None = None
    metrics: dict[str, float | int | str | bool]


class MetricDefinitionCreate(BaseModel):
    key: str
    display_name: str
    unit: str
    data_type: str = "float"
    category: str = "air_quality"
    min_value: float | None = None
    max_value: float | None = None
    thresholds_json: dict[str, Any] | None = None
    is_active: bool = True


class MetricDefinitionRead(BaseModel):
    id: UUID
    key: str
    display_name: str
    unit: str
    data_type: str
    category: str
    min_value: float | None = None
    max_value: float | None = None
    thresholds_json: dict[str, Any] | None = None
    is_active: bool
    created_at: datetime


class MetricDefinitionUpdate(BaseModel):
    display_name: str | None = None
    unit: str | None = None
    data_type: str | None = None
    category: str | None = None
    min_value: float | None = None
    max_value: float | None = None
    thresholds_json: dict[str, Any] | None = None
    is_active: bool | None = None


class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str


class UserRead(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: str
    plan: str = "free"
    created_at: datetime


class UserLogin(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class SensorCreate(BaseModel):
    name: str
    type: str = "environmental"
    latitude: float
    longitude: float
    status: str = "active"


class SensorRead(BaseModel):
    id: str
    name: str
    type: str
    latitude: float
    longitude: float
    status: str
    installed_at: datetime


class HubCreate(BaseModel):
    id: str
    name: str
    latitude: float
    longitude: float


class HubRead(BaseModel):
    id: str
    name: str
    latitude: float
    longitude: float
    status: str


class ReportCreate(BaseModel):
    category: str
    description: str
    latitude: float
    longitude: float


class ReportRead(BaseModel):
    id: UUID
    user_id: UUID
    category: str
    description: str
    latitude: float
    longitude: float
    image_url: str | None = None
    status: str
    created_at: datetime


class ReportStatusUpdate(BaseModel):
    status: str


class AlertRead(BaseModel):
    id: UUID
    sensor_id: str
    severity: str
    message: str
    acknowledged: bool
    created_at: datetime


class SensorLatestRead(BaseModel):
    sensor_id: str
    timestamp: datetime | None = None
    metrics: dict[str, Any] = {}
    battery: float | None = None


class SensorReadingHistory(BaseModel):
    time: datetime
    metric_key: str
    value_numeric: float | None = None
    value_text: str | None = None
    quality_flag: str | None = None


class SensorReadingSeries(BaseModel):
    sensor_id: str
    metric_key: str
    data_points: list[dict[str, Any]] = []


class PaginatedResponse(BaseModel):
    items: list[Any]
    total: int
    page: int
    page_size: int


class ApiKeyCreate(BaseModel):
    name: str = "Default"
    description: str | None = None
    tier: str = "free"
    rate_limit: int | None = None
    allowed_metrics: list[str] | None = None
    allowed_endpoints: list[str] | None = None
    expires_at: datetime | None = None


class ApiKeyUpdate(BaseModel):
    tier: str | None = None
    rate_limit: int | None = None
    is_active: bool | None = None
    allowed_metrics: list[str] | None = None
    allowed_endpoints: list[str] | None = None
    expires_at: datetime | None = None


class ApiKeyRead(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    key_prefix: str = ""
    tier: str = "free"
    rate_limit: int
    is_active: bool
    allowed_metrics: list[str] | None = None
    allowed_endpoints: list[str] | None = None
    created_at: datetime
    last_used_at: datetime | None = None
    expires_at: datetime | None = None
    total_requests: int = 0


class ApiKeyGenerated(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    key: str
    tier: str = "free"
    rate_limit: int
    created_at: datetime


class ApiKeyUsageStats(BaseModel):
    requests_today: int = 0
    requests_this_week: int = 0
    by_endpoint: dict[str, int] = {}
    avg_response_time_ms: float | None = None
    error_rate: float = 0.0


class CouponApply(BaseModel):
    code: str


class UsageLogRead(BaseModel):
    id: UUID
    endpoint: str
    timestamp: datetime
    cost_units: int


class SubscriptionRead(BaseModel):
    id: UUID
    plan: str
    status: str
    start_date: datetime
    end_date: datetime | None = None


class ExportResponse(BaseModel):
    sensor_id: str
    metric_key: str
    from_date: datetime
    to_date: datetime
    data: list[dict[str, Any]]
    format: str = "json"


class AggregateResponse(BaseModel):
    metric_key: str
    sensor_id: str
    avg: float | None = None
    min: float | None = None
    max: float | None = None
    count: int
    from_date: datetime
    to_date: datetime


class ExportRequest(BaseModel):
    sensor_ids: list[UUID] | Literal["all"]
    metric_keys: list[str] | Literal["all"]
    start: datetime
    end: datetime
    format: Literal["csv", "json", "parquet"] = "csv"
    granularity: Literal["raw", "1min", "1hour", "1day"] = "1hour"


class ExportRow(BaseModel):
    bucket: datetime
    sensor_id: str
    metric_key: str
    avg_val: float | None = None
    min_val: float | None = None
    max_val: float | None = None
    sample_count: int
