"""Fit the production English GOP calibration artifact from human-rated L2-ARCTIC-derived rows.

Input CSV columns: raw_gop,human_score. The corpus audio and human annotation preparation are
deliberately external to this script; never claim calibration until the generated artifact replaces
the repository placeholder and has been validated on a held-out speaker split.
"""
import argparse
import json
from pathlib import Path

import pandas as pd
from sklearn.isotonic import IsotonicRegression


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("--out", type=Path, default=Path("calibration/english_gop_isotonic.json"))
    args = parser.parse_args()
    data = pd.read_csv(args.input_csv).dropna(subset=["raw_gop", "human_score"]).sort_values("raw_gop")
    if len(data) < 100:
        raise SystemExit("At least 100 human-rated rows are required before producing a calibration artifact.")
    model = IsotonicRegression(y_min=0, y_max=100, out_of_bounds="clip").fit(data.raw_gop, data.human_score)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({
        "source": "L2-ARCTIC-derived human-rated held-out-speaker calibration",
        "x": model.X_thresholds_.tolist(),
        "y": model.y_thresholds_.tolist(),
    }, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
