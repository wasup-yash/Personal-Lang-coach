from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    service_token: str = os.getenv("ASR_SERVICE_TOKEN", "")
    whisper_model: str = os.getenv("WHISPER_MODEL", "small")
    device: str = os.getenv("ASR_DEVICE", "cpu")
    compute_type: str = os.getenv("ASR_COMPUTE_TYPE", "int8")
    phoneme_model: str = os.getenv("PHONEME_MODEL", "facebook/wav2vec2-lv-60-espeak-cv-ft")
    align_model_en: str = os.getenv("ALIGN_MODEL_EN", "")
    align_model_hi: str = os.getenv("ALIGN_MODEL_HI", "")
    s3_bucket: str = os.getenv("S3_BUCKET", "")
    s3_region: str = os.getenv("S3_REGION", "auto")
    s3_endpoint: str = os.getenv("S3_ENDPOINT", "")
    s3_access_key: str = os.getenv("S3_ACCESS_KEY_ID", "")
    s3_secret_key: str = os.getenv("S3_SECRET_ACCESS_KEY", "")
    sentry_dsn: str = os.getenv("SENTRY_DSN", "")
    gpu_cost_per_hour: float = float(os.getenv("ASR_GPU_COST_PER_HOUR", "0"))
    metrics_token: str = os.getenv("METRICS_TOKEN", "")
    max_audio_bytes: int = int(os.getenv("MAX_AUDIO_BYTES", "25000000"))
    max_parallel_jobs: int = int(os.getenv("MAX_PARALLEL_JOBS", "1"))


settings = Settings()
