#!/usr/bin/env python3
"""Convert script + personas into an audio timeline for realistic mixing."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from audio_timeline import (  # noqa: E402
    DISMISSIVE_KEYWORDS,
    INTENSITY_INTERJECTION_INTERVAL_MS,
    INTENSITY_PAUSE_MS,
    MARKER_LINES,
    classify_line,
    get_realism_config,
    intensity_cap,
    parse_interrupt_target,
    parse_overlap_ms,
    parse_pause_ms,
    parse_script_line,
    save_timeline,
    strip_delivery_tags,
    validate_timeline,
)
from load_config import get_host_name, load_show_config  # noqa: E402

SFX_MARKER_MAP = {
    "[connect]": "phone_connect.wav",
    "[stinger]": "stinger.wav",
    "[hold]": "hold_tone.wav",
}

AMBIENT_CLIPS = {
    "studio": "studio_room_tone.wav",
    "phone": "phone_hiss.wav",
    "field": "field_ambient.wav",
    "murmur": "crowd_murmur.wav",
}


def find_last_speech_event(events: list[dict], speaker: str) -> dict | None:
    for event in reversed(events):
        if event.get("type") in ("speech", "interjection") and event.get("speaker") == speaker:
            return event
    return None


def find_last_speech_any(events: list[dict]) -> dict | None:
    for event in reversed(events):
        if event.get("type") in ("speech", "interjection", "backchannel"):
            return event
    return None


def persona_is_interruptive(persona: str) -> bool:
    lowered = persona.lower()
    triggers = (
        "passionate",
        "skeptical",
        "contrarian",
        "assertive",
        "strong opinion",
        "challenges",
        "hype",
        "energetic",
    )
    return any(t in lowered for t in triggers)


def build_persona_map(config: dict) -> dict[str, str]:
    personas = {}
    host = config.get("host", {})
    host_name = get_host_name(config)
    personas[host_name] = host.get("persona", "")
    for guest in config.get("guests", {}).get("roster", []) or []:
        name = guest.get("name")
        if name:
            personas[name] = guest.get("persona", "")
    return personas


def style_allows_guest_overlap(style: str, realism: dict) -> bool:
    if not realism.get("enabled") or not realism.get("allowGuestOverlap"):
        return False
    return style in ("debate", "roundtable")


def build_timeline_from_script(script_text: str, config: dict) -> dict:
    host_name = get_host_name(config)
    realism = get_realism_config(config)
    if not realism.get("enabled", True):
        realism = {**realism, "allowGuestOverlap": False, "ambientBeds": False}
    style = config.get("structure", {}).get("style", "debate")
    intensity = realism.get("intensity", "moderate")
    default_pause = INTENSITY_PAUSE_MS.get(intensity, 350)
    max_interjections = intensity_cap(config)
    interjection_count = 0
    last_interjection_ms = -999_999

    personas = build_persona_map(config)
    events: list[dict] = []
    event_index = 0
    cursor_ms = 0
    last_speech_by_speaker: dict[str, dict] = {}

    lines = script_text.strip().split("\n")
    pending_pause_ms = default_pause

    for line in lines:
        parsed = parse_script_line(line)
        if not parsed:
            continue

        speaker, text = parsed

        if speaker == "__marker__":
            marker = text
            sfx_file = SFX_MARKER_MAP.get(marker)
            if sfx_file:
                event_id = f"sfx_{event_index:03d}"
                events.append({
                    "id": event_id,
                    "type": "sfx",
                    "marker": marker,
                    "clipRef": f"sfx/{sfx_file}",
                    "startMs": cursor_ms,
                })
                event_index += 1
            continue

        line_type = classify_line(speaker, text)
        interrupt_target = parse_interrupt_target(text)
        overlap_ms_offset = parse_overlap_ms(text)
        pause_before = parse_pause_ms(text, pending_pause_ms)
        pending_pause_ms = default_pause

        clean_text = strip_delivery_tags(text)
        if not clean_text:
            continue

        if line_type == "interjection" and interrupt_target:
            base = find_last_speech_event(events, interrupt_target)
            if base is None:
                base = find_last_speech_any(events)
            if base is None:
                line_type = "speech"
            else:
                event_id = f"evt_{event_index:03d}"
                overlap_ratio = 0.82
                if overlap_ms_offset is not None and base.get("estimatedDurationMs"):
                    overlap_ratio = max(
                        0.5,
                        min(0.95, 1.0 - (-overlap_ms_offset / base["estimatedDurationMs"])),
                    )
                overlap_group = f"overlap_{event_index}"
                base.setdefault("duckDuring", []).append(event_id)
                base["overlapGroup"] = overlap_group

                events.append({
                    "id": event_id,
                    "type": "interjection",
                    "speaker": speaker,
                    "text": clean_text,
                    "clipRef": f"segments/{event_id}.wav",
                    "overlapOf": base["id"],
                    "overlapRatio": overlap_ratio,
                    "volumeDb": 0,
                    "duckDb": -6,
                    "overlapGroup": overlap_group,
                    "ttsNote": (
                        "Deliver as a quick overlapping interjection; "
                        "do not pause as if waiting for your turn."
                    ),
                })
                interjection_count += 1
                last_interjection_ms = cursor_ms
                event_index += 1
                continue

        if line_type == "backchannel":
            base = find_last_speech_any(events)
            if base and base.get("speaker") != speaker:
                event_id = f"evt_{event_index:03d}"
                overlap_group = f"overlap_{event_index}"
                base.setdefault("duckDuring", [])
                events.append({
                    "id": event_id,
                    "type": "backchannel",
                    "speaker": speaker,
                    "text": f"[quietly] {clean_text}",
                    "clipRef": f"segments/{event_id}.wav",
                    "overlapOf": base["id"],
                    "overlapRatio": 0.35,
                    "volumeDb": -14,
                    "overlapGroup": overlap_group,
                    "ttsNote": "Short backchannel while another speaker continues.",
                })
                event_index += 1
                continue
            line_type = "speech"

        cursor_ms += pause_before
        event_id = f"turn_{event_index:03d}"
        estimated_words = len(clean_text.split())
        estimated_duration = max(1500, int(estimated_words / 2.5 * 1000))

        speech_event = {
            "id": event_id,
            "type": "speech",
            "speaker": speaker,
            "text": clean_text,
            "clipRef": f"segments/{event_id}.wav",
            "startMs": cursor_ms,
            "estimatedDurationMs": estimated_duration,
            "duckDuring": [],
        }
        events.append(speech_event)
        last_speech_by_speaker[speaker] = speech_event
        cursor_ms += estimated_duration
        event_index += 1

        if (
            realism.get("enabled")
            and style_allows_guest_overlap(style, realism)
            and interjection_count < max_interjections
            and speaker != host_name
            and (cursor_ms - last_interjection_ms) >= INTENSITY_INTERJECTION_INTERVAL_MS.get(intensity, 90_000)
        ):
            lowered = clean_text.lower()
            if any(kw in lowered for kw in DISMISSIVE_KEYWORDS):
                for other_speaker, persona in personas.items():
                    if other_speaker == speaker or other_speaker == host_name:
                        continue
                    if not persona_is_interruptive(persona):
                        continue
                    if (cursor_ms - last_interjection_ms) < 60_000:
                        continue
                    interjection_count += 1
                    last_interjection_ms = cursor_ms
                    inj_id = f"evt_{event_index:03d}"
                    overlap_group = f"overlap_{event_index}"
                    speech_event.setdefault("duckDuring", []).append(inj_id)
                    speech_event["overlapGroup"] = overlap_group
                    events.append({
                        "id": inj_id,
                        "type": "interjection",
                        "speaker": other_speaker,
                        "text": "[sharply] Wait — I have to push back on that.",
                        "clipRef": f"segments/{inj_id}.wav",
                        "overlapOf": speech_event["id"],
                        "overlapRatio": 0.78,
                        "volumeDb": 0,
                        "duckDb": -6,
                        "overlapGroup": overlap_group,
                        "autoGenerated": True,
                        "ttsNote": (
                            "Deliver as a quick overlapping interjection; "
                            "do not pause as if waiting for your turn."
                        ),
                    })
                    event_index += 1
                    break

    if realism.get("enabled") and realism.get("ambientBeds"):
        events.insert(0, {
            "id": "amb_studio",
            "type": "ambient",
            "clipRef": "sfx/studio_room_tone.wav",
            "startMs": 0,
            "loop": True,
            "volumeDb": -28,
            "treatment": "studio",
        })
        events.insert(1, {
            "id": "amb_phone",
            "type": "ambient",
            "clipRef": "sfx/phone_hiss.wav",
            "startMs": 0,
            "loop": True,
            "volumeDb": -32,
            "treatment": "phone",
        })
        if style == "roundtable":
            events.append({
                "id": "amb_murmur",
                "type": "ambient",
                "clipRef": "sfx/crowd_murmur.wav",
                "startMs": 0,
                "loop": True,
                "volumeDb": -34,
                "treatment": "murmur",
            })

    return {
        "version": 1,
        "realism": realism,
        "style": style,
        "events": events,
    }


def main():
    parser = argparse.ArgumentParser(description="Build audio timeline from script")
    parser.add_argument("--workspace", default="workspace")
    parser.add_argument("--config", default=None)
    args = parser.parse_args()

    config = load_show_config(args.workspace, args.config)
    script_path = os.path.join(args.workspace, "data", "script.md")
    if not os.path.exists(script_path):
        print("ERROR: script.md not found")
        return

    with open(script_path, encoding="utf-8") as f:
        script_text = f.read()

    print("=== AI Talk Radio: Audio Direction ===\n")

    timeline = build_timeline_from_script(script_text, config)
    issues = validate_timeline(timeline)
    if issues:
        print("Timeline validation warnings:")
        for issue in issues:
            print(f"  - {issue}")

    path = save_timeline(args.workspace, timeline)
    speech_events = [e for e in timeline["events"] if e.get("type") in ("speech", "interjection", "backchannel")]
    overlap_events = [e for e in timeline["events"] if e.get("overlapOf")]
    print(f"✅ Timeline saved to {path}")
    print(f"   Speech events: {len(speech_events)}")
    print(f"   Overlap events: {len(overlap_events)}")
    print(f"   Total events: {len(timeline['events'])}")


if __name__ == "__main__":
    main()
