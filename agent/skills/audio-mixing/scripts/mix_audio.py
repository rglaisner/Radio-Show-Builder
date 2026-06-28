#!/usr/bin/env python3
"""Mix speech, overlaps, ambient beds, SFX, and music into the final radio show."""

import argparse
import json
import os
import sys

from pydub import AudioSegment

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(SCRIPT_DIR, "..", "..", "show-production", "scripts"))
from audio_timeline import (  # noqa: E402
    SPEECH_EVENT_TYPES,
    build_manifest,
    load_timeline,
    save_manifest,
    strip_non_serializable_clip_refs,
)
from load_config import get_host_name, load_show_config  # noqa: E402


def get_segment_duration(config, seg_type, default_ms):
    segments = config.get("structure", {}).get("segments", [])
    for seg in segments:
        if seg.get("type") == seg_type and seg.get("enabled", True):
            dur = seg.get("durationSeconds")
            if dur:
                return dur * 1000
    return default_ms


def load_clip(audio_dir, clip_ref):
    path = os.path.join(audio_dir, clip_ref.replace("/", os.sep))
    if not os.path.exists(path):
        return None
    if path.endswith(".mp3"):
        return AudioSegment.from_mp3(path)
    return AudioSegment.from_wav(path)


def apply_duck_envelope(segment, duck_windows, duck_db=-6):
    """Apply gain reduction during overlap windows."""
    if not duck_windows:
        return segment

    result = segment
    for start_ms, end_ms in duck_windows:
        start_ms = max(0, start_ms)
        end_ms = min(len(segment), end_ms)
        if start_ms >= end_ms:
            continue
        before = result[:start_ms]
        during = result[start_ms:end_ms] + duck_db
        after = result[end_ms:]
        result = before + during + after
    return result


def loop_to_length(segment, length_ms):
    if len(segment) == 0:
        return AudioSegment.silent(duration=length_ms)
    loops = []
    total = 0
    while total < length_ms:
        loops.append(segment)
        total += len(segment)
    combined = sum(loops[1:], loops[0]) if len(loops) > 1 else loops[0]
    return combined[:length_ms]


def resolve_timeline_events(timeline, audio_dir):
    """Resolve absolute start times and clip durations."""
    events = timeline.get("events", [])
    by_id = {event["id"]: event for event in events if event.get("id")}
    resolved = []
    cursor_ms = 0

    for event in events:
        event_type = event.get("type", "speech")
        clip_ref = event.get("clipRef")
        clip = load_clip(audio_dir, clip_ref) if clip_ref else None
        duration_ms = len(clip) if clip else event.get("estimatedDurationMs", 0)

        if event_type == "pause":
            pause_ms = event.get("durationMs", 350)
            cursor_ms += pause_ms
            event["resolvedStartMs"] = cursor_ms
            event["durationMs"] = pause_ms
            resolved.append(event)
            continue

        if event_type in ("ambient", "music"):
            event["resolvedStartMs"] = event.get("startMs", 0)
            event["durationMs"] = duration_ms
            event["_clip"] = clip
            resolved.append(event)
            continue

        if event_type == "sfx":
            start_ms = event.get("startMs", cursor_ms)
            event["resolvedStartMs"] = start_ms
            event["durationMs"] = duration_ms
            event["_clip"] = clip
            resolved.append(event)
            continue

        if event_type not in SPEECH_EVENT_TYPES:
            continue

        overlap_of = event.get("overlapOf")
        if overlap_of and overlap_of in by_id:
            base = by_id[overlap_of]
            base_start = base.get("resolvedStartMs", base.get("startMs", 0))
            base_duration = base.get("durationMs", base.get("estimatedDurationMs", 0))
            ratio = event.get("overlapRatio", 0.82)
            start_ms = int(base_start + base_duration * ratio)
            event["resolvedStartMs"] = start_ms
        else:
            start_ms = event.get("startMs", cursor_ms)
            event["resolvedStartMs"] = start_ms
            cursor_ms = start_ms + duration_ms

        event["durationMs"] = duration_ms
        event["_clip"] = clip
        resolved.append(event)

    total_ms = max(
        (e.get("resolvedStartMs", 0) + e.get("durationMs", 0) for e in resolved),
        default=0,
    )
    return resolved, total_ms


def build_duck_windows(events):
    """Map base event id -> list of (start, end) duck windows."""
    by_id = {event["id"]: event for event in events if event.get("id")}
    windows = {}

    for event in events:
        if event.get("type") not in SPEECH_EVENT_TYPES:
            continue
        overlap_of = event.get("overlapOf")
        if not overlap_of or overlap_of not in by_id:
            continue
        base = by_id[overlap_of]
        start = event.get("resolvedStartMs", 0)
        end = start + event.get("durationMs", 0)
        base_start = base.get("resolvedStartMs", 0)
        rel_start = max(0, start - base_start)
        rel_end = max(rel_start, end - base_start)
        windows.setdefault(overlap_of, []).append((rel_start, rel_end))

    return windows


def apply_sidechain_duck(music_bed, speech_events, total_ms, duck_db=-8):
    """Lower music when speech is active."""
    if len(music_bed) == 0:
        return music_bed

    bed = music_bed[:total_ms] if len(music_bed) >= total_ms else loop_to_length(music_bed, total_ms)
    result = bed
    for event in speech_events:
        start = event.get("resolvedStartMs", 0)
        end = start + event.get("durationMs", 0)
        if start >= len(result):
            continue
        end = min(len(result), end)
        before = result[:start]
        during = result[start:end] + duck_db
        after = result[end:]
        result = before + during + after
    return result


def mix_timeline(timeline, config, workspace):
    audio_dir = os.path.join(workspace, "audio")
    host_name = get_host_name(config)
    features = config.get("features", {})
    realism = config.get("realism", {})

    events, total_ms = resolve_timeline_events(timeline, audio_dir)
    total_ms += 3000
    duck_windows = build_duck_windows(events)

    print(f"Timeline duration: {total_ms / 1000:.1f}s")
    master = AudioSegment.silent(duration=total_ms)

    ambient_events = [e for e in events if e.get("type") == "ambient"]
    if realism.get("ambientBeds", True):
        for event in ambient_events:
            clip = event.get("_clip")
            if clip is None:
                continue
            bed = loop_to_length(clip, total_ms)
            volume_db = event.get("volumeDb", -28)
            master = master.overlay(bed + volume_db, position=0)

    speech_placed = []
    for event in events:
        if event.get("type") not in SPEECH_EVENT_TYPES:
            continue
        clip = event.get("_clip")
        if clip is None:
            print(f"  ⚠ Missing clip for {event['id']}")
            continue

        clip = clip + event.get("volumeDb", 0)
        duck_list = duck_windows.get(event["id"], [])
        duck_db = event.get("duckDb", -6)
        if duck_list:
            clip = apply_duck_envelope(clip, duck_list, duck_db=duck_db)

        position = event.get("resolvedStartMs", 0)
        master = master.overlay(clip, position=position)
        speech_placed.append(event)

    for event in events:
        if event.get("type") != "sfx":
            continue
        clip = event.get("_clip")
        if clip is None:
            continue
        position = event.get("resolvedStartMs", event.get("startMs", 0))
        master = master.overlay(clip, position=position)

    has_music = (
        features.get("backgroundMusic", True)
        and config.get("music", {}).get("enabled", True)
    )
    music_path = os.path.join(audio_dir, "music", "background.mp3")
    intro_ms = get_segment_duration(config, "intro", 15000)
    outro_ms = get_segment_duration(config, "closing", 15000)

    if has_music and os.path.exists(music_path):
        print("Mixing background music with sidechain ducking...")
        music = AudioSegment.from_mp3(music_path)
        master = AudioSegment.silent(duration=500) + master
        total_ms = len(master)

        intro_music = (music[:intro_ms] - 15).fade_in(1000).fade_out(3000)
        outro_music = (music[:outro_ms] - 15).fade_in(3000).fade_out(1000)
        combined = master.overlay(intro_music, position=0)

        outro_position = max(0, len(master) - outro_ms)
        combined = combined.overlay(outro_music, position=outro_position)

        if len(music) > intro_ms:
            bed = music[intro_ms : intro_ms + len(master)]
            bed = apply_sidechain_duck(bed - 20, speech_placed, len(master), duck_db=-6)
            combined = combined.overlay(bed, position=intro_ms + 500)
        master = combined
    else:
        print("No background music — speech-only output.")

    master = master.fade_in(500).fade_out(2000)
    strip_non_serializable_clip_refs(events)
    manifest = build_manifest(events, len(master))
    return master, manifest


def build_fallback_from_speech(workspace, config):
    """Legacy path when no timeline exists."""
    speech_path = os.path.join(workspace, "audio", "speech", "speech.wav")
    if not os.path.exists(speech_path):
        return None, None

    speech = AudioSegment.from_wav(speech_path)
    padding = AudioSegment.silent(duration=3000)
    speech = speech + padding

    features = config.get("features", {})
    music_path = os.path.join(workspace, "audio", "music", "background.mp3")
    has_music = (
        features.get("backgroundMusic", True)
        and config.get("music", {}).get("enabled", True)
        and os.path.exists(music_path)
    )

    intro_ms = get_segment_duration(config, "intro", 15000)
    outro_ms = get_segment_duration(config, "closing", 15000)

    if has_music:
        music = AudioSegment.from_mp3(music_path)
        speech = AudioSegment.silent(duration=500) + speech
        intro_music = (music[:intro_ms] - 15).fade_in(1000).fade_out(3000)
        outro_music = (music[:outro_ms] - 15).fade_in(3000).fade_out(1000)
        combined = speech.overlay(intro_music, position=0)
        outro_position = max(0, len(speech) - outro_ms)
        combined = combined.overlay(outro_music, position=outro_position)
        if len(music) > intro_ms:
            bed = music[intro_ms : intro_ms + len(speech)] - 20
            combined = combined.overlay(bed, position=intro_ms)
    else:
        combined = speech

    combined = combined.fade_in(500).fade_out(2000)
    return combined, None


def main():
    parser = argparse.ArgumentParser(description="Mix AI Talk Radio audio")
    parser.add_argument("--workspace", default="workspace", help="Workspace directory")
    parser.add_argument("--config", default=None, help="Path to show_config.json")
    args = parser.parse_args()

    config = load_show_config(args.workspace, args.config)
    output_dir = os.path.join(args.workspace, "audio", "final")
    os.makedirs(output_dir, exist_ok=True)

    print("=== AI Talk Radio: Audio Mixing ===\n")

    timeline = load_timeline(args.workspace)
    manifest = None

    if timeline and timeline.get("events"):
        print("Using timeline-based mixer...")
        combined, manifest = mix_timeline(timeline, config, args.workspace)
    else:
        print("No timeline found — using legacy speech concat mixer...")
        combined, manifest = build_fallback_from_speech(args.workspace, config)

    if combined is None:
        print("ERROR: No speech audio to mix")
        return

    if manifest:
        save_manifest(args.workspace, manifest)
        print(f"Timeline manifest saved ({len(manifest.get('transcript', []))} transcript entries)")

    mp3_path = os.path.join(output_dir, "ai_radio.mp3")
    try:
        combined.export(mp3_path, format="mp3", bitrate="192k")
        print(f"Saved MP3: {mp3_path}")
    except Exception as e:
        print(f"MP3 export failed: {e}")
        return

    mp3_mb = os.path.getsize(mp3_path) / (1024 * 1024)
    print(f"\n  MP3: {mp3_mb:.1f} MB")
    print(f"  Duration: {len(combined) / 1000:.1f}s")
    print("\n✅ AI Talk Radio mixed successfully!")


if __name__ == "__main__":
    main()
