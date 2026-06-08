"""Shared ShowConfig loader for pipeline scripts."""

import json
import os

DEFAULT_CONFIG = {
    "version": 1,
    "topic": "",
    "durationMinutes": 3,
    "mood": "Informative",
    "host": {
        "name": "Paul",
        "persona": "Professional, warm British community radio host",
        "accent": "British English accent as heard in London, England",
        "voice": "Puck",
        "delivery": "measured",
    },
    "guests": {"mode": "auto", "count": 2},
    "structure": {
        "style": "debate",
        "segments": [
            {"type": "coldOpen", "enabled": True, "durationSeconds": 10},
            {"type": "intro", "enabled": True, "durationSeconds": 15},
            {"type": "main", "enabled": True},
            {"type": "closing", "enabled": True, "durationSeconds": 15},
        ],
    },
    "features": {
        "stationId": False,
        "phoneConnectSfx": False,
        "topicStingers": False,
        "coHost": False,
        "fieldReporter": False,
        "mockSponsorRead": False,
        "listenerMail": False,
        "midShowRecap": False,
        "signOffCatchphrase": False,
        "backgroundMusic": True,
        "holdMusic": False,
    },
    "music": {"mood": "tech", "enabled": True},
    "toneContext": "",
}


def deep_merge(base, override):
    result = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def load_show_config(workspace, config_path=None):
    """Load show_config.json from workspace or explicit path."""
    if config_path is None:
        config_path = os.path.join(workspace, "data", "show_config.json")

    if not os.path.exists(config_path):
        return dict(DEFAULT_CONFIG)

    with open(config_path, encoding="utf-8") as f:
        loaded = json.load(f)

    return deep_merge(DEFAULT_CONFIG, loaded)


def get_host_name(config):
    return config.get("host", {}).get("name", "Paul")


def get_enabled_segments(config):
    segments = config.get("structure", {}).get("segments", [])
    return [s for s in segments if s.get("enabled", True)]


def get_enabled_features(config):
    features = config.get("features", {})
    return [key for key, enabled in features.items() if enabled is True and key != "signOffPhrase"]


def _format_guest_archetype(guest, index):
    """Format a single guest/archetype line for script instructions."""
    label = guest.get("name") or f"Archetype {index + 1}"
    persona = guest.get("persona", "tech-savvy caller")
    location = guest.get("location", "remote location")
    gender = guest.get("gender", "unspecified")
    accent = guest.get("accent")
    delivery = guest.get("delivery")
    treatment = guest.get("audioTreatment", "phone")

    parts = [f"- {label}: {persona}, calling from {location}"]
    if gender != "unspecified":
        parts.append(f"gender: {gender}")
    if accent:
        parts.append(f"accent: {accent}")
    if delivery:
        parts.append(f"delivery: {delivery}")
    if treatment != "phone":
        parts.append(f"audio: {treatment}")
    return ", ".join(parts)


def _gender_tag(gender):
    if gender == "female":
        return "[Female]"
    if gender == "male":
        return "[Male]"
    return ""


def build_guest_instructions(config):
    guests = config.get("guests", {})
    mode = guests.get("mode", "auto")
    count = guests.get("count", 2)
    roster = guests.get("roster", [])

    if mode == "fixed" and roster:
        lines = [
            f"**Guests (FIXED ROSTER — use exactly these {len(roster)} speakers):**"
        ]
        for i, guest in enumerate(roster):
            name = guest.get("name") or "Guest"
            persona = guest.get("persona", "tech-savvy caller")
            location = guest.get("location", "remote location")
            gender = guest.get("gender", "unspecified")
            accent = guest.get("accent") or f"based on {location}"
            delivery = guest.get("delivery", "conversational")
            gender_tag = _gender_tag(gender)
            accent_tag = f"[Accent: {accent}]" if accent else ""
            lines.append(_format_guest_archetype(guest, i))
            lines.append(
                f"  Speaker line format for {name}: "
                f"{name}: {gender_tag} {accent_tag} [dialogue]".strip()
            )
        lines.append(
            "You MUST use these exact speaker names. Do NOT invent different guest names."
        )
        lines.append(
            "Introduce each caller by name and location before their first spoken line."
        )
        return "\n".join(lines)

    if mode == "guided":
        lines = [
            f"**Guests (GUIDED — generate exactly {count} callers):**",
            f"Create {count} distinct callers matching the show style.",
            "Give each a unique name, location, and perspective.",
            "Introduce each caller by name and location before their first spoken line.",
        ]
        if roster:
            lines.append(
                "Use these archetypes as inspiration (you may invent names, but match persona/location/gender):"
            )
            for i, guest in enumerate(roster[:count]):
                lines.append(_format_guest_archetype(guest, i))
        return "\n".join(lines)

    return (
        f"**Guests (AUTO — generate callers matching the style, target ~{count}):**\n"
        "Invent distinct callers with unique names, locations, and perspectives."
    )


def build_segment_instructions(config):
    enabled = get_enabled_segments(config)
    if not enabled:
        return ""

    lines = ["**Enabled segments (include all of these in order):**"]
    for seg in enabled:
        seg_type = seg.get("type", "main")
        dur = seg.get("durationSeconds")
        hint = f" (~{dur}s)" if dur else ""
        lines.append(f"- {seg_type}{hint}")

    features = config.get("features", {})
    if features.get("stationId"):
        lines.append("- Include a station ID bumper at the top (host reads call letters/tagline).")
    if features.get("midShowRecap"):
        lines.append("- Include a mid-show recap where the host summarizes key points.")
    if features.get("newsFlash"):
        lines.append("- Include a brief news-flash interlude from the research.")
    if features.get("listenerMail"):
        lines.append("- Include 1-2 listener mail questions the host reads aloud.")
    if features.get("mockSponsorRead"):
        lines.append(
            "- Include a 15-second fictional tech sponsor read (no real brands)."
        )
    if features.get("signOffCatchphrase") and features.get("signOffPhrase"):
        lines.append(
            f"- End with this sign-off phrase: \"{features['signOffPhrase']}\""
        )
    if features.get("phoneConnectSfx"):
        lines.append(
            "- Before each caller's FIRST line, add a [connect] marker on its own line."
        )
    if features.get("topicStingers"):
        lines.append("- Between major topics, add a [stinger] marker on its own line.")
    if features.get("holdMusic"):
        lines.append("- Between segments, add a [hold] marker on its own line.")

    return "\n".join(lines)
