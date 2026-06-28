#!/usr/bin/env python3
"""Deterministic quality gate for final radio show audio."""

import argparse
import json
import os
import subprocess
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
from audio_timeline import INTENSITY_MAX_INTERJECTIONS, get_realism_config, load_manifest, load_timeline  # noqa: E402
from load_config import load_show_config  # noqa: E402


def get_audio_duration_ms(path):
    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_file(path)
        return len(audio)
    except Exception:
        return 0


def get_peak_dbfs(path):
    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_file(path)
        return audio.max_dBFS
    except Exception:
        return None


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


def count_overlap_events(manifest):
    transcript = manifest.get("transcript", []) if manifest else []
    return sum(1 for entry in transcript if entry.get("overlapOf") or entry.get("overlapGroup"))


def check_overlap_budget(config, manifest):
    realism = get_realism_config(config)
    if not realism.get("enabled", True):
        return []

    intensity = realism.get("intensity", "moderate")
    duration_min = config.get("durationMinutes", 3)
    max_allowed = max(1, int(duration_min * INTENSITY_MAX_INTERJECTIONS.get(intensity, 3) / 3))
    overlap_count = count_overlap_events(manifest)

    warnings = []
    if overlap_count > max_allowed:
        warnings.append(
            f"Overlap count ({overlap_count}) exceeds {intensity} realism budget ({max_allowed})"
        )
    return warnings


def check_overlap_windows(manifest):
    """Ensure interjections have minimum intelligibility window."""
    warnings = []
    if not manifest:
        return warnings

    for entry in manifest.get("transcript", []):
        if not entry.get("overlapOf"):
            continue
        duration_ms = entry.get("endMs", 0) - entry.get("startMs", 0)
        if duration_ms < 200:
            warnings.append(
                f"Interjection '{entry.get('id', '?')}' is only {duration_ms}ms (min 200ms)"
            )
    return warnings


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
    manifest = load_manifest(args.workspace)
    timeline = load_timeline(args.workspace)

    print("=== AI Talk Radio: Quality Check ===\n")

    report = {
        "passed": True,
        "duration_delta_pct": 0,
        "overlap_count": count_overlap_events(manifest),
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

        peak = get_peak_dbfs(mp3_path)
        if peak is not None and peak > -0.5:
            report["warnings"].append(
                f"Possible clipping detected (peak {peak:.1f} dBFS) — check overlap mix levels"
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

    report["warnings"].extend(check_overlap_budget(config, manifest))
    report["warnings"].extend(check_overlap_windows(manifest))

    if timeline and not manifest:
        report["warnings"].append("Timeline exists but timeline_manifest.json missing after mix")

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
