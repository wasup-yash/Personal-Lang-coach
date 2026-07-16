from typing import Literal, Optional
from pydantic import BaseModel, Field


class AsrStorageRequest(BaseModel):
    job_id: str = Field(min_length=8, max_length=100)
    object_key: str = Field(min_length=12, max_length=512)
    transcript: str = Field(default="", max_length=2500)
    language: Literal["en", "hi"]
    user_id: str = Field(min_length=8, max_length=100)


class PhonemeResult(BaseModel):
    phoneme: str
    start: float
    end: float
    gop_score: float
    calibrated_score: Optional[float] = None
    calibrated: bool


class WordResult(BaseModel):
    word: str
    start: float
    end: float
    confidence: float


class AsrResult(BaseModel):
    transcript: str
    language: Literal["en", "hi"]
    words: list[WordResult]
    phonemes: list[PhonemeResult]
    alignment_source: Literal["whisperx", "estimated"]
    calibrated: bool
    calibration_note: str
    processing_ms: dict[str, int]
