#!/usr/bin/env python3
"""Generate TTS audio with telephone effect on correspondent voices using the Interactions API."""

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import time
import wave
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed

from google import genai

warnings.filterwarnings("ignore", message="Interactions usage is experimental")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(SCRIPT_DIR, "..", "..", "show-production", "scripts"))
from audio_timeline import SPEECH_EVENT_TYPES, load_timeline, save_timeline  # noqa: E402
from load_config import (  # noqa: E402
    build_guided_speaker_map,
    get_guest_profile_for_speaker,
    get_host_name,
    guest_accent,
    guest_delivery_style,
    load_show_config,
    pick_guest_voice,
)

FEMALE_VOICES = ["Kore"]
MALE_VOICES = ["Charon", "Fenrir", "Puck"]

MAX_RETRIES = 3
MAX_WORKERS = 8

MARKER_LINES = {"[connect]", "[stinger]", "[hold]"}

POLICY_ERROR_MARKERS = (
    "input blocked",
    "prohibited use",
    "content policy",
    "sensitive words",
    "safety filter",
)


def is_policy_error(exc):
    message = str(exc).lower()
    return any(marker in message for marker in POLICY_ERROR_MARKERS)


def record_policy_incident(workspace, incident):
    incidents_path = os.path.join(workspace, "data", "policy_incidents.json")
    os.makedirs(os.path.dirname(incidents_path), exist_ok=True)
    incidents = []
    if os.path.exists(incidents_path):
        with open(incidents_path, encoding="utf-8") as f:
            try:
                incidents = json.load(f)
            except json.JSONDecodeError:
                incidents = []
    incidents.append(incident)
    with open(incidents_path, "w", encoding="utf-8") as f:
        json.dump(incidents, f, indent=2)

    payload = {
        "eventId": incident.get("eventId"),
        "speaker": incident.get("speaker"),
        "text": incident.get("text", "")[:500],
        "providerMessage": incident.get("providerMessage", "")[:500],
    }
    print(f"POLICY_ERROR:{json.dumps(payload)}", flush=True)


def build_profiles(config, guided_map=None):
    host = config.get("host", {})
    host_name = get_host_name(config)
    profiles = {
        host_name: {
            "profile": (
                f"# AUDIO PROFILE: {host_name}\n"
                f"## Role: Community Radio Host\n"
                f"## Persona: {host.get('persona', 'Professional radio host')}"
            ),
            "scene": "## THE SCENE: The Studio\nA professional broadcast studio with a high-quality microphone.",
            "notes": (
                f"### DIRECTOR'S NOTES\n"
                f"Style: {host.get('delivery', 'measured')}.\n"
                f"Pacing: Steady but dynamic.\n"
                f"Accent: {host.get('accent', 'British English')}."
            ),
            "treatment": "studio",
        },
        "default_caller": {
            "profile": "# AUDIO PROFILE: Caller\n## Role: Tech-savvy individual calling in to a radio show.",
            "scene": "## THE SCENE: Remote Location via Phone\nCalling in from a home, office, or public space.",
            "notes": "### DIRECTOR'S NOTES\nStyle: Conversational, natural.\nPacing: Normal conversational pace.\nAccent: American English.",
            "treatment": "phone",
        },
    }

    roster = config.get("guests", {}).get("roster", [])
    for guest in roster:
        name = guest.get("name")
        if name:
            profiles[name] = _profile_from_guest(name, guest)

    if guided_map:
        for speaker_name, guest in guided_map.items():
            if speaker_name not in profiles:
                profiles[speaker_name] = _profile_from_guest(speaker_name, guest)

    return profiles


def _profile_from_guest(name, guest):
    delivery = guest_delivery_style(guest)
    accent = guest_accent(guest)
    return {
        "profile": (
            f"# AUDIO PROFILE: {name}\n"
            f"## Role: Radio show guest\n"
            f"## Persona: {guest.get('persona', 'Tech-savvy caller')}"
        ),
        "scene": f"## THE SCENE: {guest.get('location', 'Remote location')}",
        "notes": (
            f"### DIRECTOR'S NOTES\n"
            f"Style: {delivery}.\n"
            f"Pacing: Normal conversational pace.\n"
            f"Accent: {accent}."
        ),
        "treatment": guest.get("audioTreatment", "phone"),
    }


def build_roster_lookups(config, host_voice, guided_map=None):
    """Build name-indexed voice, gender, and accent maps from guest roster."""
    voices = {}
    genders = {}
    accents = {}
    used_voices = {host_voice}
    male_index = 0
    female_index = 0

    def assign_guest(name, guest):
        nonlocal male_index, female_index
        voice, male_index, female_index = pick_guest_voice(
            guest, used_voices, male_index, female_index
        )
        used_voices.add(voice)
        voices[name] = voice
        gender = guest.get("gender", "unspecified")
        if gender == "female":
            genders[name] = "Female"
        elif gender == "male":
            genders[name] = "Male"
        accents[name] = guest_accent(guest)

    for guest in config.get("guests", {}).get("roster", []) or []:
        name = guest.get("name")
        if name:
            assign_guest(name, guest)

    if guided_map:
        for speaker_name, guest in guided_map.items():
            if speaker_name not in voices:
                assign_guest(speaker_name, guest)

    return voices, genders, accents


def wave_file(filename, pcm, channels=1, rate=24000, sample_width=2):
    with wave.open(filename, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(sample_width)
        wf.setframerate(rate)
        wf.writeframes(pcm)


def split_script_by_turns(script_text):
    turns = []
    for line in script_text.strip().split("\n"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line in MARKER_LINES:
            turns.append(("__marker__", line))
            continue
        if ":" in line:
            speaker = line.split(":")[0].strip()
            text = ":".join(line.split(":")[1:]).strip()
            if text:
                turns.append((speaker, text))
    return turns


def generate_tts_single(client, speaker, text, output_path, voice, accent, profile_data, tts_note=""):
    notes = profile_data.get("notes", "")
    notes = re.sub(r"Accent:.*", f"Accent: {accent}", notes)
    if tts_note:
        notes += f"\n{tts_note}"

    prompt = f"""{profile_data.get('profile', '')}

{profile_data.get('scene', '')}

{notes}

#### TRANSCRIPT
{text}
"""

    interaction = client.interactions.create(
        model="gemini-3.1-flash-tts-preview",
        input=prompt,
        response_modalities=["audio"],
        generation_config={
            "speech_config": [{"voice": voice, "language": "en-US"}]
        },
        store=False,
    )

    for step in getattr(interaction, "steps", []):
        for item in getattr(step, "content", []):
            item_type = getattr(item, "type", "")
            mime_type = getattr(item, "mime_type", "")
            if item_type == "audio" or (isinstance(mime_type, str) and mime_type.startswith("audio/")):
                pcm_data = base64.b64decode(item.data)
                wave_file(output_path, pcm_data)
                return True
    return False


def apply_telephone_filter(input_path, output_path, boost=False, field=False):
    vol = "1.8" if boost else "1.5"
    if field:
        af = (
            "highpass=f=200,"
            "lowpass=f=2800,"
            "aecho=0.8:0.9:40:0.3,"
            "acompressor=threshold=-20dB:ratio=4:attack=5:release=50,"
            f"volume={vol}"
        )
    else:
        af = (
            "highpass=f=300,"
            "lowpass=f=3400,"
            "acompressor=threshold=-20dB:ratio=4:attack=5:release=50,"
            f"volume={vol}"
        )

    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "warning", "-i", input_path, "-af", af, output_path],
        check=True,
        capture_output=True,
    )


def get_treatment(speaker, host_name, profiles, config):
    if speaker == host_name:
        return "studio"
    if speaker in profiles:
        return profiles[speaker].get("treatment", "phone")
    if config.get("features", {}).get("coHost") and "co" in speaker.lower():
        return "studio"
    return "phone"


def process_event(
    client,
    event,
    speaker,
    text,
    voice,
    accent,
    audio_dir,
    profiles,
    host_name,
    config,
    workspace,
    boost=False,
    tts_note="",
):
    event_id = event["id"]
    clip_ref = event.get("clipRef", f"segments/{event_id}.wav")
    final_path = os.path.join(audio_dir, clip_ref.replace("/", os.sep))
    os.makedirs(os.path.dirname(final_path), exist_ok=True)
    raw_path = final_path.replace(".wav", "_raw.wav")

    profile_data = profiles.get(speaker, profiles.get("default_caller", {}))

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            success = generate_tts_single(
                client, speaker, text, raw_path, voice, accent, profile_data, tts_note
            )
            if success:
                break
            print(f"    [{event_id}] Attempt {attempt}/{MAX_RETRIES}: no audio returned")
        except Exception as e:
            if is_policy_error(e):
                provider_message = str(e)
                record_policy_incident(
                    workspace,
                    {
                        "eventId": event_id,
                        "speaker": speaker,
                        "text": text,
                        "providerMessage": provider_message,
                    },
                )
                print(f"    [{event_id}] ✗ Policy block — skipping segment (remediation required)", flush=True)
                return (event_id, None)
            print(f"    [{event_id}] Attempt {attempt}/{MAX_RETRIES} failed: {e}")
            if attempt < MAX_RETRIES:
                time.sleep(2 * attempt)
    else:
        print(f"    [{event_id}] ✗ All {MAX_RETRIES} attempts failed, skipping")
        return (event_id, None)

    treatment = get_treatment(speaker, host_name, profiles, config)

    if treatment == "studio":
        os.replace(raw_path, final_path)
        print(f"    [{event_id}] ✓ {speaker} ({voice}) clean studio")
    else:
        try:
            apply_telephone_filter(
                raw_path,
                final_path,
                boost=boost,
                field=(treatment == "field"),
            )
            os.remove(raw_path)
            print(f"    [{event_id}] ✓ {speaker} ({voice}) + {treatment} filter")
        except Exception:
            os.replace(raw_path, final_path)
            print(f"    [{event_id}] ✓ {speaker} ({voice}) (filter failed, using raw)")

    return (event_id, final_path)


def assign_voice_for_speaker(
    speaker,
    text,
    host_name,
    host_voice,
    assigned_voices,
    assigned_accents,
    roster_voices,
    roster_genders,
    roster_accents,
    config,
    guided_map,
    male_index,
    female_index,
):
    gender = roster_genders.get(speaker, "Male")
    if "[Female]" in text:
        gender = "Female"
        text = text.replace("[Female]", "").strip()
    elif "[Male]" in text:
        gender = "Male"
        text = text.replace("[Male]", "").strip()

    accent = roster_accents.get(speaker, "American English")
    accent_match = re.search(r"\[Accent: ([^\]]+)\]", text)
    if accent_match:
        accent = accent_match.group(1)
        text = re.sub(r"\[Accent: [^\]]+\]", "", text).strip()

    boost = "[boost]" in text
    if boost:
        text = text.replace("[boost]", "").strip()

    if speaker not in assigned_voices:
        if speaker in roster_voices:
            assigned_voices[speaker] = roster_voices[speaker]
        elif speaker == host_name:
            assigned_voices[speaker] = host_voice
        else:
            guest = get_guest_profile_for_speaker(speaker, config, guided_map)
            if guest:
                voice, male_index, female_index = pick_guest_voice(
                    guest, set(assigned_voices.values()), male_index, female_index
                )
                assigned_voices[speaker] = voice
            elif gender == "Female":
                assigned_voices[speaker] = FEMALE_VOICES[female_index % len(FEMALE_VOICES)]
                female_index += 1
            else:
                pool = [v for v in MALE_VOICES if v != host_voice or speaker == host_name]
                assigned_voices[speaker] = pool[male_index % len(pool)]
                male_index += 1

    if speaker not in assigned_accents:
        assigned_accents[speaker] = accent

    return (
        assigned_voices[speaker],
        assigned_accents[speaker],
        text,
        boost,
        male_index,
        female_index,
    )


def get_speech_events(timeline, script_text):
    if timeline:
        return [
            event for event in timeline.get("events", [])
            if event.get("type") in SPEECH_EVENT_TYPES and event.get("text")
        ]

    events = []
    for index, (speaker, text) in enumerate(split_script_by_turns(script_text)):
        if speaker == "__marker__":
            continue
        events.append({
            "id": f"turn_{index:03d}",
            "type": "speech",
            "speaker": speaker,
            "text": text,
            "clipRef": f"segments/turn_{index:03d}.wav",
        })
    return events


def concatenate_wav_files(file_list, output_path, gap_ms=300):
    if not file_list:
        return

    gap_pcm = b"\x00\x00" * int(24000 * gap_ms / 1000)
    all_pcm = b""
    for i, fpath in enumerate(file_list):
        with wave.open(fpath, "rb") as wf:
            all_pcm += wf.readframes(wf.getnframes())
        if i < len(file_list) - 1:
            all_pcm += gap_pcm

    wave_file(output_path, all_pcm)


def main():
    parser = argparse.ArgumentParser(description="Generate TTS with telephone effect")
    parser.add_argument("--workspace", default="workspace", help="Workspace directory")
    parser.add_argument("--config", default=None, help="Path to show_config.json")
    parser.add_argument("--workers", type=int, default=MAX_WORKERS, help="Max parallel TTS workers")
    parser.add_argument(
        "--retry-events",
        default=None,
        help="Comma-separated event IDs to regenerate (after policy remediation)",
    )
    args = parser.parse_args()

    retry_event_ids = None
    if args.retry_events:
        retry_event_ids = {e.strip() for e in args.retry_events.split(",") if e.strip()}

    config = load_show_config(args.workspace, args.config)
    host_name = get_host_name(config)
    host_voice = config.get("host", {}).get("voice", "Puck")

    script_path = os.path.join(args.workspace, "data", "script.md")
    with open(script_path, encoding="utf-8") as f:
        script = f.read()

    guided_map = build_guided_speaker_map(script, config)
    if guided_map:
        map_path = os.path.join(args.workspace, "data", "guided_speaker_map.json")
        with open(map_path, "w", encoding="utf-8") as f:
            json.dump(
                {name: {"persona": g.get("persona"), "speakingStyle": g.get("speakingStyle")} for name, g in guided_map.items()},
                f,
                indent=2,
            )

    timeline = load_timeline(args.workspace)
    speech_events = get_speech_events(timeline, script)

    if retry_event_ids:
        speech_events = [e for e in speech_events if e.get("id") in retry_event_ids]
        print(f"Retry mode: regenerating {len(speech_events)} event(s)")

    print("=== AI Talk Radio: TTS Generation ===\n")
    print(f"Found {len(speech_events)} speech events (host: {host_name})")
    print(f"Generating in parallel with {args.workers} workers\n")

    audio_dir = os.path.join(args.workspace, "audio")
    segments_dir = os.path.join(audio_dir, "speech", "segments")
    os.makedirs(segments_dir, exist_ok=True)

    profiles = build_profiles(config, guided_map)
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY", "dummy-key"))

    assigned_voices = {host_name: host_voice}
    assigned_accents = {host_name: config.get("host", {}).get("accent", "British English")}
    male_index = 0
    female_index = 0

    roster_voices, roster_genders, roster_accents = build_roster_lookups(
        config, host_voice, guided_map
    )

    prepared = []
    for event in speech_events:
        speaker = event.get("speaker", "")
        text = event.get("text", "")
        voice, accent, clean_text, boost, male_index, female_index = assign_voice_for_speaker(
            speaker,
            text,
            host_name,
            host_voice,
            assigned_voices,
            assigned_accents,
            roster_voices,
            roster_genders,
            roster_accents,
            config,
            guided_map,
            male_index,
            female_index,
        )
        prepared.append((event, speaker, clean_text, voice, accent, boost))
        print(f"  [{event['id']}] {speaker} ({voice}): {clean_text[:60]}...")

    print("\nStarting parallel generation...")
    results = {}

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(
                process_event,
                client,
                event,
                speaker,
                text,
                voice,
                accent,
                audio_dir,
                profiles,
                host_name,
                config,
                args.workspace,
                boost,
                event.get("ttsNote", ""),
            ): event["id"]
            for event, speaker, text, voice, accent, boost in prepared
        }

        for future in as_completed(futures):
            event_id, final_path = future.result()
            results[event_id] = final_path

    if timeline:
        for event in timeline.get("events", []):
            if event.get("type") in SPEECH_EVENT_TYPES:
                path = results.get(event["id"])
                event["clipGenerated"] = path is not None
        save_timeline(args.workspace, timeline)

    segment_files = [
        results[event["id"]]
        for event, *_rest in prepared
        if results.get(event["id"]) is not None
    ]

    output_path = os.path.join(args.workspace, "audio", "speech", "speech.wav")
    concatenate_wav_files(segment_files, output_path, gap_ms=350)

    if os.path.exists(output_path):
        with wave.open(output_path, "rb") as wf:
            duration = wf.getnframes() / wf.getframerate()
        failed = len(prepared) - len(segment_files)
        print("\n✅ TTS complete!")
        print(f"   Output: {output_path}")
        print(f"   Duration: {duration:.1f}s | Segments: {len(segment_files)}/{len(prepared)}", end="")
        if failed:
            print(f" ({failed} failed)")
        else:
            print()

    incidents_path = os.path.join(args.workspace, "data", "policy_incidents.json")
    if os.path.exists(incidents_path) and not retry_event_ids:
        with open(incidents_path, encoding="utf-8") as f:
            try:
                incidents = json.load(f)
            except json.JSONDecodeError:
                incidents = []
        if incidents:
            print(f"\n⚠ Policy incidents recorded: {len(incidents)} segment(s) blocked")
            sys.exit(2)


if __name__ == "__main__":
    main()
