import json
from bisect import bisect_left
from pathlib import Path

CALIBRATION_FILE = Path(__file__).resolve().parent.parent / "calibration" / "english_gop_isotonic.json"


def english_calibrator():
    if not CALIBRATION_FILE.exists():
        return None
    return json.loads(CALIBRATION_FILE.read_text(encoding="utf-8"))


def calibrate_gop(raw_score: float, language: str) -> tuple[float | None, bool]:
    if language != "en":
        return None, False
    calibration = english_calibrator()
    if not calibration or str(calibration.get("source", "")).startswith("PLACEHOLDER"):
        return None, False
    x_values = calibration["x"]
    y_values = calibration["y"]
    index = max(0, min(len(x_values) - 1, bisect_left(x_values, raw_score)))
    return round(float(y_values[index]), 1), True
