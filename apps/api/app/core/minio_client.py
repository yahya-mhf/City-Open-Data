from io import BytesIO

from minio import Minio

from smart_city_shared.config import settings


class MinioManager:
    def __init__(self) -> None:
        self.client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=False,
        )
        self.bucket = settings.MINIO_BUCKET

    async def ensure_bucket(self) -> None:
        if not self.client.bucket_exists(self.bucket):
            self.client.make_bucket(self.bucket)

    def upload_file(self, object_name: str, data: BytesIO, content_type: str) -> str:
        self.client.put_object(
            self.bucket,
            object_name,
            data,
            length=data.getbuffer().nbytes,
            content_type=content_type,
        )
        return f"{settings.MINIO_ENDPOINT}/{self.bucket}/{object_name}"


minio_manager = MinioManager()
