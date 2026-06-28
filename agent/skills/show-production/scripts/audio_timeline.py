"""Audio timeline schema, validation, and manifest utilities for realistic radio mixing."""

from __future__ import annotations

import json
import os
import re
from typing import Any

SPEECH_EVENT_TYPES = frozenset({
    "speech",
    "interjection",
    "reaction",
    "backchannel",
})

NON_SPEECH_EVENT_TYPES = frozenset({
    "pause",
    "ambient",
    "sfx",
    "music",
})

VALID_EVENT_TYPES = SPEECH_EVENT_TYPES | NON_SPEECH_EVENT_TYPES

MARKER_LINES = {"[connect]", "[stinger]", "[hold]"}

INTERRUPT_RE = re.compile(r"\[interrupts\s+([^\]]+)\]", re.IGNORECASE)
PAUSE_TAG_RE = re.compile(r"\[pause\s+([\d.]+)s?\]", re.IGNORECASE)
OVERLAP_MS_RE = re.compile(r"\[overlap\s+([+-]?\d+)ms\]", re.IGNORECASE)
REACTION_TAG = re.compile(r"\[reaction\]", re.IGNORECASE)
UNDER_TAG = re.compile(r"\[under\]", re.IGNORECASE)
GENDER_RE = re.compile(r"\[(Male|Female)\]")
ACCENT_RE = re.compile(r"\[Accent:\s*([^\]]+)\]")

INTENSITY_PAUSE_MS = {
    "subtle": 450,
    "moderate": 350,
    "lively": 250,
}

INTENSITY_MAX_INTERJECTIONS = {
    "subtle": 1,
    "moderate": 3,
    "lively": 6,
}

INTENSITY_INTERJECTION_INTERVAL_MS = {
    "subtle": 120_000,
    "moderate": 90_000,
    "lively": 60_000,
}

DISMISSIVE_KEYWORDS = (
    "obviously",
    "ridiculous",
    "that's wrong",
    "nonsense",
    "can't align",
    "no way",
    "absolutely not",
)


def get_realism_config(config: dict[str, Any]) -> dict[str, Any]:
    realism = config.get("realism") or {}
    return {
        "enabled": realism.get("enabled", True),
        "intensity": realism.get("intensity", "moderate"),
        "allowGuestOverlap": realism.get("allowGuestOverlap", True),
        "ambientBeds": realism.get("ambientBeds", True),
    }


def strip_delivery_tags(text: str) -> str:
    """Remove structural tags while preserving emotional delivery tags for TTS."""
    text = INTERRUPT_RE.sub("", text)
    text = PAUSE_TAG_RE.sub("", text)
    text = OVERLAP_MS_RE.sub("", text)
    text = REACTION_TAG.sub("", text)
    text = UNDER_TAG.sub("", text)
    text = GENDER_RE.sub("", text)
    text = ACCENT_RE.sub("", text)
    text = text.replace("[boost]", "")
    return re.sub(r"\s+", " ", text).strip()


def parse_script_line(line: str) -> tuple[str, str] | None:
    line = line.strip()
    if not line or line.startswith("#"):
        return None
    if line in MARKER_LINES:
        return ("__marker__", line)
    if ":" not in line:
        return None
    speaker = line.split(":")[0].strip()
    text = ":".join(line.split(":")[1:]).strip()
    if not text:
        return None
    return (speaker, text)


def classify_line(speaker: str, text: str) -> str:
    if INTERRUPT_RE.search(text):
        return "interjection"
    if REACTION_TAG.search(text) or UNDER_TAG.search(text):
        return "backchannel"
    return "speech"


def parse_pause_ms(text: str, default_ms: int) -> int:
    match = PAUSE_TAG_RE.search(text)
    if match:
        return int(float(match.group(1)) * 1000)
    return default_ms


def parse_overlap_ms(text: str) -> int | None:
    match = OVERLAP_MS_RE.search(text)
    if match:
        return int(match.group(1))
    return None


def parse_interrupt_target(text: str) -> str | None:
    match = INTERRUPT_RE.search(text)
    if match:
        return match.group(1).strip()
    return None


def intensity_cap(config: dict[str, Any]) -> int:
    realism = get_realism_config(config)
    duration_min = config.get("durationMinutes", 3)
    per_show = INTENSITY_MAX_INTERJECTIONS.get(realism["intensity"], 3)
    return max(1, int(duration_min * per_show / 3))


def validate_timeline(timeline: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    events = timeline.get("events", [])
    if not events:
        issues.append("Timeline has no events")
        return issues

    ids = set()
    for event in events:
        event_id = event.get("id")
        if not event_id:
            issues.append("Event missing id")
            continue
        if event_id in ids:
            issues.append(f"Duplicate event id: {event_id}")
        ids.add(event_id)

        event_type = event.get("type", "speech")
        if event_type not in VALID_EVENT_TYPES:
            issues.append(f"Invalid event type: {event_type}")

        if event_type in SPEECH_EVENT_TYPES and not event.get("text"):
            issues.append(f"Speech event {event_id} missing text")

        overlap_of = event.get("overlapOf")
        if overlap_of and overlap_of not in ids:
            issues.append(f"Event {event_id} references unknown overlapOf {overlap_of}")

    return issues


def save_timeline(workspace: str, timeline: dict[str, Any]) -> str:
    path = os.path.join(workspace, "data", "audio_timeline.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(timeline, f, indent=2)
    return path


def load_timeline(workspace: str) -> dict[str, Any] | None:
    path = os.path.join(workspace, "data", "audio_timeline.json")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build_manifest(
    events: list[dict[str, Any]],
    total_duration_ms: int,
) -> dict[str, Any]:
    """Build resolved timeline manifest for metadata and QC."""
    transcript_entries = []
    overlap_groups: list[list[str]] = []

    for event in events:
        if event.get("type") not in SPEECH_EVENT_TYPES:
            continue
        start_ms = event.get("resolvedStartMs", event.get("startMs", 0))
        duration_ms = event.get("durationMs", 0)
        end_ms = start_ms + duration_ms
        entry = {
            "id": event["id"],
            "speaker": event.get("speaker", ""),
            "text": strip_delivery_tags(event.get("text", "")),
            "startMs": start_ms,
            "endMs": end_ms,
            "type": event.get("type", "speech"),
        }
        if event.get("overlapOf"):
            entry["overlapOf"] = event["overlapOf"]
            entry["overlapGroup"] = event.get("overlapGroup")
        transcript_entries.append(entry)

    active_overlaps = [
        e["overlapGroup"]
        for e in transcript_entries
        if e.get("overlapGroup")
    ]
    if active_overlaps:
        overlap_groups = list({g for g in active_overlaps})

    return {
        "totalDurationMs": total_duration_ms,
        "events": events,
        "transcript": transcript_entries,
        "overlapGroups": overlap_groups,
    }


def save_manifest(workspace: str, manifest: dict[str, Any]) -> str:
    path = os.path.join(workspace, "data", "timeline_manifest.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    return path


def load_manifest(workspace: str) -> dict[str, Any] | None:
    path = os.path.join(workspace, "data", "timeline_manifest.json")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def ms_to_timecode(ms: int) -> str:
    total_seconds = max(0, ms // 1000)
    minutes = total_seconds // 60
    seconds = total_seconds % 60
    return f"{minutes:02d}:{seconds:02d}"
