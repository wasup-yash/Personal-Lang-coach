from pathlib import Path
import boto3
from .config import settings


def client():
    if not settings.s3_bucket:
        raise RuntimeError("S3_BUCKET is required for object-key processing")
    return boto3.client(
        "s3",
        region_name=settings.s3_region,
        endpoint_url=settings.s3_endpoint or None,
        aws_access_key_id=settings.s3_access_key or None,
        aws_secret_access_key=settings.s3_secret_key or None,
    )


def download_object(key: str, destination: Path) -> None:
    metadata = client().head_object(Bucket=settings.s3_bucket, Key=key)
    if metadata.get("ContentLength", 0) > settings.max_audio_bytes:
        raise ValueError("Stored audio exceeds the configured size limit")
    if not str(metadata.get("ContentType", "")).startswith("audio/"):
        raise ValueError("Stored object is not an audio file")
    client().download_file(settings.s3_bucket, key, str(destination))


def delete_object(key: str) -> None:
    client().delete_object(Bucket=settings.s3_bucket, Key=key)
