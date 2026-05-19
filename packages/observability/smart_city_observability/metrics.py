from prometheus_client import Counter, Histogram, Gauge


class MetricsCollector:
    def __init__(self, prefix: str = "sc") -> None:
        self.http_requests_total = Counter(
            f"{prefix}_http_requests_total",
            "Total HTTP requests",
            ["method", "endpoint", "status"],
        )
        self.http_request_duration = Histogram(
            f"{prefix}_http_request_duration_seconds",
            "HTTP request duration in seconds",
            ["method", "endpoint"],
            buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
        )
        self.messages_processed = Counter(
            f"{prefix}_messages_processed_total",
            "Total messages processed",
            ["queue", "status"],
        )
        self.errors_total = Counter(
            f"{prefix}_errors_total",
            "Total errors",
            ["service", "error_type"],
        )
        self.db_query_duration = Histogram(
            f"{prefix}_db_query_duration_seconds",
            "Database query duration in seconds",
            ["query_type"],
            buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
        )
        self.sensors_active = Gauge(
            f"{prefix}_sensors_active",
            "Number of active sensors",
        )
        self.alerts_active = Gauge(
            f"{prefix}_alerts_active",
            "Number of active unacknowledged alerts",
        )
        self.ingestion_lag = Gauge(
            f"{prefix}_ingestion_lag_seconds",
            "Ingestion lag in seconds",
        )


metrics = MetricsCollector()
