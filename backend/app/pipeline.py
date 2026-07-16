from __future__ import annotations

import re
import logging
import threading
from pathlib import Path

import numpy as np
import soundfile as sf

from .calibration import calibrate_gop
from .config import settings
from .g2p import phonemes_for_word
from .models import PhonemeResult, WordResult
from .metrics import ALIGNMENT_FALLBACKS

_whisper = None
_phoneme_processor = None
_phoneme_model = None
_model_lock = threading.Lock()
logger = logging.getLogger(__name__)


def transcribe(audio_path: Path, language: str) -> tuple[str, list[dict]]:
    global _whisper
    from faster_whisper import WhisperModel

    if _whisper is None:
        with _model_lock:
            if _whisper is None:
                _whisper = WhisperModel(settings.whisper_model, device=settings.device, compute_type=settings.compute_type)
    segments, _ = _whisper.transcribe(str(audio_path), language=language, word_timestamps=True, vad_filter=True)
    materialized = list(segments)
    words = []
    for segment in materialized:
        for word in segment.words or []:
            words.append({"word": word.word.strip(), "start": word.start, "end": word.end, "confidence": word.probability})
    return " ".join(segment.text.strip() for segment in materialized).strip(), words


def align_words(audio_path: Path, target_text: str, language: str, transcript_words: list[dict]) -> tuple[list[WordResult], str]:
    if target_text.strip():
        expected = tokenise(target_text)
        try:
            import whisperx

            audio = whisperx.load_audio(str(audio_path))
            model_name = (settings.align_model_en if language == "en" else settings.align_model_hi) or None
            align_model, metadata = whisperx.load_align_model(language_code=language, device=settings.device, model_name=model_name)
            duration = len(audio) / 16000
            aligned = whisperx.align([{"start": 0, "end": duration, "text": target_text}], align_model, metadata, audio, settings.device)
            words = [
                WordResult(word=item["word"], start=float(item["start"]), end=float(item["end"]), confidence=float(item.get("score", 0.0)))
                for item in aligned.get("word_segments", [])
                if item.get("word") and item.get("start") is not None and item.get("end") is not None
            ]
            if words:
                return words, "whisperx"
        except (RuntimeError, ValueError, OSError, KeyError) as error:
            # Hindi alignment coverage varies by model/version. The caller receives an explicit estimated marker on fallback.
            logger.warning("WhisperX alignment failed; using estimated word timings", exc_info=error, extra={"language": language})
            ALIGNMENT_FALLBACKS.labels(language, type(error).__name__).inc()
        return estimate_word_times(expected, audio_path), "estimated"

    return [WordResult(**word) for word in transcript_words if word.get("word")], "estimated"


def phoneme_scores(audio_path: Path, words: list[WordResult], language: str) -> list[PhonemeResult]:
    if not words:
        return []
    global _phoneme_processor, _phoneme_model
    import torch
    from transformers import AutoModelForCTC, AutoProcessor

    if _phoneme_processor is None or _phoneme_model is None:
        with _model_lock:
            if _phoneme_processor is None or _phoneme_model is None:
                _phoneme_processor = AutoProcessor.from_pretrained(settings.phoneme_model)
                _phoneme_model = AutoModelForCTC.from_pretrained(settings.phoneme_model).to(settings.device)
                _phoneme_model.eval()

    audio = load_mono_16k(audio_path)
    inputs = _phoneme_processor(audio, sampling_rate=16000, return_tensors="pt")
    values = inputs.input_values.to(settings.device)
    with torch.no_grad():
        log_probs = torch.log_softmax(_phoneme_model(values).logits[0], dim=-1).cpu().numpy()
    frame_seconds = (len(audio) / 16000) / max(len(log_probs), 1)
    tokenizer = _phoneme_processor.tokenizer
    results: list[PhonemeResult] = []

    for word in words:
        phones = phonemes_for_word(word.word, language)
        expected = [(phone, tokenizer.convert_tokens_to_ids(phone)) for phone in phones]
        unknown = [phone for phone, token_id in expected if token_id is None or token_id == tokenizer.unk_token_id]
        if unknown:
            raise ValueError(f"Phoneme model cannot score expected phonemes: {', '.join(unknown)}")
        start_frame = max(0, int(word.start / frame_seconds))
        end_frame = min(len(log_probs), max(start_frame + len(expected), int(word.end / frame_seconds)))
        word_log_probs = log_probs[start_frame:end_frame]
        if len(word_log_probs) < len(expected):
            raise ValueError(f"Insufficient CTC frames for word: {word.word}")
        state_path = ctc_viterbi_states(word_log_probs, [token_id for _, token_id in expected], tokenizer.pad_token_id)
        for index, (phone, token_id) in enumerate(expected):
            frames = np.flatnonzero(state_path == (index * 2 + 1))
            if not len(frames):
                raise ValueError(f"CTC could not align expected phoneme: {phone}")
            phone_start = start_frame + int(frames[0])
            phone_end = start_frame + int(frames[-1]) + 1
            values_for_phone = log_probs[phone_start:phone_end]
            expected_log_probability = values_for_phone[:, token_id]
            top_two = np.partition(values_for_phone, -2, axis=1)[:, -2:]
            best = np.max(top_two, axis=1)
            second_best = np.min(top_two, axis=1)
            best_other = np.where(np.argmax(values_for_phone, axis=1) == token_id, second_best, best)
            raw_gop = float(np.mean(expected_log_probability - best_other))
            calibrated_score, calibrated = calibrate_gop(raw_gop, language)
            results.append(PhonemeResult(
                phoneme=phone,
                start=round(phone_start * frame_seconds, 3),
                end=round(max(phone_start + 1, phone_end) * frame_seconds, 3),
                gop_score=round(raw_gop, 3),
                calibrated_score=calibrated_score,
                calibrated=calibrated,
            ))
    return results


def ctc_viterbi_states(log_probs: np.ndarray, target_ids: list[int], blank_id: int | None) -> np.ndarray:
    """Return the Viterbi CTC state index for each frame, including blank states."""
    if blank_id is None:
        raise ValueError("The CTC tokenizer must define a blank/pad token.")
    states = [blank_id]
    for token_id in target_ids:
        states.extend([token_id, blank_id])
    state_count = len(states)
    trellis = np.full((len(log_probs), state_count), -np.inf, dtype=np.float64)
    backpointers = np.full((len(log_probs), state_count), -1, dtype=np.int32)
    trellis[0, 0] = log_probs[0, blank_id]
    if state_count > 1:
        trellis[0, 1] = log_probs[0, states[1]]

    for frame in range(1, len(log_probs)):
        for state, token_id in enumerate(states):
            candidates = [(trellis[frame - 1, state], state)]
            if state > 0:
                candidates.append((trellis[frame - 1, state - 1], state - 1))
            if state > 1 and state % 2 == 1 and token_id != states[state - 2]:
                candidates.append((trellis[frame - 1, state - 2], state - 2))
            score, previous = max(candidates, key=lambda candidate: candidate[0])
            trellis[frame, state] = score + log_probs[frame, token_id]
            backpointers[frame, state] = previous

    final_state = max((state_count - 1, state_count - 2), key=lambda state: trellis[-1, state])
    if not np.isfinite(trellis[-1, final_state]):
        raise ValueError("No valid CTC alignment path exists.")
    path = np.empty(len(log_probs), dtype=np.int32)
    state = final_state
    for frame in range(len(log_probs) - 1, -1, -1):
        path[frame] = state
        state = backpointers[frame, state]
        if frame and state < 0:
            raise ValueError("Incomplete CTC alignment path.")
    return path


def tokenise(text: str) -> list[str]:
    return re.findall(r"[^\W_]+", text, flags=re.UNICODE)


def estimate_word_times(words: list[str], audio_path: Path) -> list[WordResult]:
    duration = sf.info(str(audio_path)).duration
    if not words:
        return []
    return [
        WordResult(word=word, start=round(duration * index / len(words), 3), end=round(duration * (index + 1) / len(words), 3), confidence=0.0)
        for index, word in enumerate(words)
    ]


def load_mono_16k(audio_path: Path) -> np.ndarray:
    # WhisperX decodes with ffmpeg at 16 kHz, avoiding a separate resampling dependency.
    import whisperx
    return whisperx.load_audio(str(audio_path))
