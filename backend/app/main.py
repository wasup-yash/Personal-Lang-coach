from __future__ import annotations

import asyncio
import logging
import shutil
import tempfile
import time
from pathlib import Path

import sentry_sdk
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from .config import settings
from .metrics import GPU_COST, GPU_SECONDS, QUEUE_DEPTH, REQUESTS, STAGE_SECONDS
from .models import AsrResult, AsrStorageRequest
from .pipeline import align_words, phoneme_scores, transcribe
from .storage import delete_object, download_object

if settings.sentry_dsn:
    sentry_sdk.init(dsn=settings.sentry_dsn, traces_sample_rate=0.1)

app = FastAPI(title="Personal Lang Coach ASR", version="1.0.0")
QUEUE_DEPTH.set(0)
INFERENCE_SLOTS = asyncio.Semaphore(settings.max_parallel_jobs)
logger = logging.getLogger(__name__)


def require_service_token(authorization: str | None) -> None:
    if not settings.service_token or authorization != f"Bearer {settings.service_token}":
        raise HTTPException(status_code=401, detail="Unauthorized ASR service request.")


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.get("/metrics")
def metrics(authorization: str | None = Header(default=None)):
    if not settings.metrics_token or authorization != f"Bearer {settings.metrics_token}":
        raise HTTPException(status_code=401, detail="Unauthorized metrics request.")
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/asr", response_model=AsrResult)
async def asr_from_storage(payload: AsrStorageRequest, authorization: str | None = Header(default=None)):
    require_service_token(authorization)
    if not payload.object_key.startswith(f"jobs/{payload.user_id}/{payload.job_id}/"):
        raise HTTPException(status_code=400, detail="Object key does not belong to the supplied job.")
    temporary = Path(tempfile.mkdtemp(prefix="plc-asr-")) / "audio"
    try:
        with STAGE_SECONDS.labels("storage_download").time():
            await asyncio.to_thread(download_object, payload.object_key, temporary)
        async with INFERENCE_SLOTS:
            return await asyncio.to_thread(run_pipeline, temporary, payload.transcript, payload.language)
    finally:
        # Explicit deletion is the primary control; the one-day bucket lifecycle rule is only a backstop.
        try:
            await asyncio.to_thread(delete_object, payload.object_key)
        except Exception as error:
            logger.exception("Explicit transient-audio deletion failed", exc_info=error)
            raise HTTPException(status_code=502, detail="ASR result withheld because transient audio cleanup failed.") from error
        finally:
            shutil.rmtree(temporary.parent, ignore_errors=True)


@app.post("/asr/upload", response_model=AsrResult)
async def asr_from_upload(
    audio: UploadFile = File(...),
    transcript: str = Form(default=""),
    language: str = Form(...),
    authorization: str | None = Header(default=None),
):
    require_service_token(authorization)
    if language not in {"en", "hi"}:
        raise HTTPException(status_code=400, detail="language must be en or hi")
    temporary_dir = Path(tempfile.mkdtemp(prefix="plc-asr-upload-"))
    temporary = temporary_dir / Path(audio.filename or "audio.bin").name
    try:
        with temporary.open("wb") as target:
            written = 0
            while chunk := await audio.read(1024 * 1024):
                written += len(chunk)
                if written > settings.max_audio_bytes:
                    raise HTTPException(status_code=413, detail="Audio exceeds the configured size limit.")
                target.write(chunk)
        async with INFERENCE_SLOTS:
            return await asyncio.to_thread(run_pipeline, temporary, transcript, language)
    finally:
        shutil.rmtree(temporary_dir, ignore_errors=True)


def run_pipeline(audio_path: Path, expected_transcript: str, language: str) -> AsrResult:
    started = time.perf_counter()
    stages: dict[str, int] = {}
    try:
        duration_seconds = len(load_audio_for_duration(audio_path)) / 16000
        if not 15 <= duration_seconds <= 45:
            raise ValueError("Audio duration must be between 15 and 45 seconds.")
        checkpoint = time.perf_counter()
        with STAGE_SECONDS.labels("transcription").time():
            transcript, transcript_words = transcribe(audio_path, language)
        stages["asr"] = int((time.perf_counter() - checkpoint) * 1000)

        checkpoint = time.perf_counter()
        with STAGE_SECONDS.labels("alignment").time():
            words, alignment_source = align_words(audio_path, expected_transcript, language, transcript_words)
        stages["alignment"] = int((time.perf_counter() - checkpoint) * 1000)

        checkpoint = time.perf_counter()
        with STAGE_SECONDS.labels("gop_scoring").time():
            phonemes = phoneme_scores(audio_path, words, language) if expected_transcript.strip() else []
        stages["phoneme_scoring"] = int((time.perf_counter() - checkpoint) * 1000)
        elapsed = time.perf_counter() - started
        GPU_SECONDS.inc(elapsed if settings.device == "cuda" else 0)
        GPU_COST.inc(elapsed / 3600 * settings.gpu_cost_per_hour if settings.device == "cuda" else 0)
        REQUESTS.labels(language, "success").inc()
        stages["total"] = int(elapsed * 1000)
        calibrated = language == "en" and any(phone.calibrated for phone in phonemes)
        note = (
            "Provide an expected transcript to produce phoneme feedback." if not expected_transcript.strip()
            else "English scores are calibrated only after replacing the placeholder mapping with an L2-ARCTIC human-rated calibration artifact." if language == "en"
            else "Hindi phoneme scores are experimental and uncalibrated pending a labeled Hindi learner-speech set."
        )
        return AsrResult(transcript=transcript, language=language, words=words, phonemes=phonemes, alignment_source=alignment_source, calibrated=calibrated, calibration_note=note, processing_ms=stages)
    except Exception as error:
        REQUESTS.labels(language, "error").inc()
        sentry_sdk.capture_exception(error)
        raise HTTPException(status_code=502, detail="ASR, alignment, or phoneme scoring failed.") from error


def load_audio_for_duration(audio_path: Path):
    import whisperx
    return whisperx.load_audio(str(audio_path))
