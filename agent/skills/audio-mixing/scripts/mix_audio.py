#!/usr/bin/env python3
"""Mix speech audio and background music into the final AI Talk Radio radio show."""

import argparse
import json
import os
import sys

from pydub import AudioSegment

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(SCRIPT_DIR, "..", "..", "show-production", "scripts"))
from load_config import load_show_config  # noqa: E402


def get_segment_duration(config, seg_type, default_ms):
    segments = config.get("structure", {}).get("segments", [])
    for seg in segments:
        if seg.get("type") == seg_type and seg.get("enabled", True):
            dur = seg.get("durationSeconds")
            if dur:
                return dur * 1000
    return default_ms


def insert_sfx_at_markers(speech, workspace, gap_ms=300):
    """Insert SFX at script marker positions (approximate spacing)."""
    markers_path = os.path.join(workspace, "data", "script_markers.json")
    if not os.path.exists(markers_path):
        return speech

    with open(markers_path, encoding="utf-8") as f:
        markers = json.load(f)

    if not markers:
        return speech

    sfx_dir = os.path.join(workspace, "audio", "sfx")
    connect_path = os.path.join(sfx_dir, "phone_connect.wav")
    stinger_path = os.path.join(sfx_dir, "stinger.wav")

    result = speech
    offset = 0
    avg_turn_ms = len(speech) / max(len(markers) + 1, 1)

    for marker_info in markers:
        marker = marker_info.get("marker", "")
        position = int(offset + avg_turn_ms * marker_info.get("index", 0))
        position = min(position, len(result))

        sfx_path = None
        if marker == "[connect]" and os.path.exists(connect_path):
            sfx_path = connect_path
        elif marker == "[stinger]" and os.path.exists(stinger_path):
            sfx_path = stinger_path

        if sfx_path:
            try:
                sfx = AudioSegment.from_wav(sfx_path)
                result = result.overlay(sfx, position=position)
            except Exception:
                pass

    return result


def main():
    parser = argparse.ArgumentParser(description="Mix AI Talk Radio audio")
    parser.add_argument("--workspace", default="workspace", help="Workspace directory")
    parser.add_argument("--config", default=None, help="Path to show_config.json")
    args = parser.parse_args()

    config = load_show_config(args.workspace, args.config)
    features = config.get("features", {})

    speech_path = os.path.join(args.workspace, "audio", "speech", "speech.wav")
    music_path = os.path.join(args.workspace, "audio", "music", "background.mp3")
    output_dir = os.path.join(args.workspace, "audio", "final")
    os.makedirs(output_dir, exist_ok=True)

    print("=== AI Talk Radio: Audio Mixing ===\n")

    print("Loading speech audio...")
    speech = AudioSegment.from_wav(speech_path)
    print(f"Speech duration: {len(speech) / 1000:.1f}s")

    speech = insert_sfx_at_markers(speech, args.workspace)

    padding = AudioSegment.silent(duration=3000)
    speech = speech + padding
    print(f"Speech duration after padding: {len(speech) / 1000:.1f}s")

    has_music = (
        features.get("backgroundMusic", True)
        and config.get("music", {}).get("enabled", True)
        and os.path.exists(music_path)
    )

    intro_ms = get_segment_duration(config, "intro", 15000)
    outro_ms = get_segment_duration(config, "closing", 15000)

    if has_music:
        print("Loading background music...")
        music = AudioSegment.from_mp3(music_path)
        speech = AudioSegment.silent(duration=500) + speech

        intro_music = music[:intro_ms]
        intro_music = intro_music - 15
        intro_music = intro_music.fade_in(1000).fade_out(3000)

        outro_music = music[:outro_ms]
        outro_music = outro_music - 15
        outro_music = outro_music.fade_in(3000).fade_out(1000)

        print("Mixing speech + music (intro and outro with ducking)...")
        combined = speech.overlay(intro_music, position=0)

        outro_position = max(0, len(speech) - outro_ms)
        combined = combined.overlay(outro_music, position=outro_position)

        if len(music) > intro_ms:
            bed = music[intro_ms : intro_ms + len(speech)]
            bed = bed - 20
            combined = combined.overlay(bed, position=intro_ms)
    else:
        print("No background music — speech-only output.")
        combined = speech

    combined = combined.fade_in(500).fade_out(2000)

    try:
        mp3_path = os.path.join(output_dir, "ai_radio.mp3")
        combined.export(mp3_path, format="mp3", bitrate="192k")
        print(f"Saved MP3: {mp3_path}")
    except Exception as e:
        print(f"MP3 export failed: {e}")
        mp3_path = None

    if mp3_path and os.path.exists(mp3_path):
        mp3_mb = os.path.getsize(mp3_path) / (1024 * 1024)
        print(f"\n  MP3: {mp3_mb:.1f} MB")
    print(f"  Duration: {len(combined) / 1000:.1f}s")
    print("\n✅ AI Talk Radio mixed successfully!")


if __name__ == "__main__":
    main()
