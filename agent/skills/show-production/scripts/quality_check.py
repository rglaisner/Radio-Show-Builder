#!/usr/bin/env python3
"""Deterministic quality gate for final radio show audio."""

import argparse
import json
import os
import subprocess
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
from load_config import load_show_config  # noqa: E402


def get_audio_duration_ms(path):
    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_file(path)
        return len(audio)
    except Exception:
        return 0


def apply_loudnorm(input_path, output_path, target_lufs=-16.0):
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "warning",
            "-i", input_path,
            "-af", f"loudnorm=I={target_lufs}:TP=-1.5:LRA=11",
            output_path,
        ],
        check=False,
        capture_output=True,
    )


def main():
    parser = argparse.ArgumentParser(description="Quality check final audio")
    parser.add_argument("--workspace", default="workspace")
    parser.add_argument("--config", default=None)
    args = parser.parse_args()

    config = load_show_config(args.workspace, args.config)
    target_minutes = config.get("durationMinutes", 3)
    target_ms = target_minutes * 60 * 1000

    mp3_path = os.path.join(args.workspace, "audio", "final", "ai_radio.mp3")
    speech_path = os.path.join(args.workspace, "audio", "speech", "speech.wav")

    print("=== AI Talk Radio: Quality Check ===\n")

    report = {
        "passed": True,
        "duration_delta_pct": 0,
        "warnings": [],
        "repairs": [],
    }

    if not os.path.exists(mp3_path):
        report["passed"] = False
        report["warnings"].append("Final MP3 not found")
    else:
        duration_ms = get_audio_duration_ms(mp3_path)
        if target_ms > 0:
            delta_pct = abs(duration_ms - target_ms) / target_ms * 100
            report["duration_delta_pct"] = round(delta_pct, 1)
            if delta_pct > 15:
                report["warnings"].append(
                    f"Duration {duration_ms/1000:.1f}s is {delta_pct:.0f}% off target {target_minutes}min"
                )

        normalized_path = os.path.join(args.workspace, "audio", "final", "ai_radio_normalized.mp3")
        apply_loudnorm(mp3_path, normalized_path)
        if os.path.exists(normalized_path):
            os.replace(normalized_path, mp3_path)
            report["repairs"].append("Applied loudness normalization (-16 LUFS)")

    if os.path.exists(speech_path):
        speech_ms = get_audio_duration_ms(speech_path)
        if speech_ms < target_ms * 0.5:
            report["warnings"].append(
                f"Speech track ({speech_ms/1000:.1f}s) seems short for {target_minutes}min target"
            )

    segments_dir = os.path.join(args.workspace, "audio", "speech", "segments")
    if os.path.isdir(segments_dir):
        wav_count = len([f for f in os.listdir(segments_dir) if f.endswith(".wav")])
        if wav_count == 0:
            report["passed"] = False
            report["warnings"].append("No TTS segments found")

    if report["warnings"]:
        critical = any("not found" in w or "No TTS" in w for w in report["warnings"])
        if critical:
            report["passed"] = False

    report_path = os.path.join(args.workspace, "data", "quality_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    if report["passed"]:
        print("✅ Quality check PASSED")
    else:
        print("⚠️ Quality check FAILED")

    for warning in report.get("warnings", []):
        print(f"   - {warning}")
    for repair in report.get("repairs", []):
        print(f"   + {repair}")

    print(f"\nReport saved to {report_path}")


if __name__ == "__main__":
    main()
