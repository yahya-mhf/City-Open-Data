SENSOR_INGESTION_QUEUE = "sensor_ingestion_queue"
SENSOR_DEAD_LETTER_QUEUE = "sensor_dead_letter_queue"
ALERTS_QUEUE = "alerts_queue"
SENSOR_DATA_EXCHANGE = "sensor_data"
ROUTING_KEY_RAW = "sensor.raw"
ROUTING_KEY_INVALID = "sensor.invalid"
ROUTING_KEY_ALERT = "alert.created"

RATE_LIMIT_DEFAULT = 100
RATE_LIMIT_AUTH = 20
RATE_LIMIT_REPORT = 10

MAX_FILE_SIZE_MB = 10
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}

REDIS_LATEST_PREFIX = "sensor:{}:latest"

TIMESCALE_CHUNK_INTERVAL = "1 day"

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200
