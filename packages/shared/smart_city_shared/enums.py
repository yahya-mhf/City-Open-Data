from enum import StrEnum


class UserRole(StrEnum):
    CITIZEN = "citizen"
    OPERATOR = "operator"
    ADMIN = "admin"


class SensorStatus(StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    MAINTENANCE = "maintenance"
    ERROR = "error"


class HubStatus(StrEnum):
    ONLINE = "online"
    OFFLINE = "offline"
    DEGRADED = "degraded"


class ReportStatus(StrEnum):
    PENDING = "pending"
    UNDER_REVIEW = "under_review"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    REJECTED = "rejected"


class AlertSeverity(StrEnum):
    MAINTENANCE = "maintenance"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class MetricDataType(StrEnum):
    FLOAT = "float"
    INTEGER = "integer"
    BOOLEAN = "boolean"
    STRING = "string"


class MetricCategory(StrEnum):
    AIR_QUALITY = "air_quality"
    WEATHER = "weather"
    HYDROLOGY = "hydrology"
    NOISE = "noise"
    RADIATION = "radiation"
    TRAFFIC = "traffic"


class SubscriptionPlan(StrEnum):
    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class SubscriptionStatus(StrEnum):
    ACTIVE = "active"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class QualityFlag(StrEnum):
    GOOD = "good"
    SUSPECT = "suspect"
    BAD = "bad"


class ReportCategory(StrEnum):
    STREET_LIGHT = "street_light"
    POTHOLE = "pothole"
    GARBAGE = "garbage"
    NOISE_COMPLAINT = "noise_complaint"
    WATER_LEAK = "water_leak"
    TRAFFIC_ISSUE = "traffic_issue"
    AIR_QUALITY = "air_quality"
    OTHER = "other"
