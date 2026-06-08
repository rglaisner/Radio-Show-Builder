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
from load_config import get_host_name, load_show_config  # noqa: E402

FEMALE_VOICES = ["Kore"]
MALE_VOICES = ["Charon", "Fenrir", "Puck"]

MAX_RETRIES = 3
MAX_WORKERS = 8

MARKER_LINES = {"[connect]", "[stinger]", "[hold]"}


def build_profiles(config):
    host = config.get("host", {})
    host_name = get_host_name(config)
    return {
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


def guest_accent(guest):
    accent = guest.get("accent")
    if accent:
        return accent
    location = guest.get("location")
    if location:
        return f"Based on location — {location}"
    return "American English"


def build_guest_profiles(config):
    profiles = {}
    roster = config.get("guests", {}).get("roster", [])
    for guest in roster:
        name = guest.get("name")
        if not name:
            continue
        delivery = guest.get("delivery", "conversational")
        accent = guest_accent(guest)
        profiles[name] = {
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
    return profiles


def build_roster_lookups(config):
    """Build name-indexed voice, gender, and accent maps from guest roster."""
    voices = {}
    genders = {}
    accents = {}
    for guest in config.get("guests", {}).get("roster", []):
        name = guest.get("name")
        if not name:
            continue
        if guest.get("voice"):
            voices[name] = guest["voice"]
        gender = guest.get("gender", "unspecified")
        if gender == "female":
            genders[name] = "Female"
        elif gender == "male":
            genders[name] = "Male"
        accents[name] = guest_accent(guest)
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


def generate_tts_single(client, speaker, text, output_path, voice, accent, profile_data):
    notes = profile_data.get("notes", "")
    notes = re.sub(r"Accent:.*", f"Accent: {accent}", notes)

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


def process_turn(client, turn_index, speaker, text, voice, accent, segments_dir, profiles, host_name, config, boost=False):
    if speaker == "__marker__":
        marker_path = os.path.join(segments_dir, f"turn_{turn_index:03d}_marker.txt")
        with open(marker_path, "w", encoding="utf-8") as f:
            f.write(text)
        return (turn_index, None)

    raw_path = os.path.join(segments_dir, f"turn_{turn_index:03d}_raw.wav")
    final_path = os.path.join(segments_dir, f"turn_{turn_index:03d}.wav")

    profile_data = profiles.get(speaker, profiles.get("default_caller", {}))

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            success = generate_tts_single(client, speaker, text, raw_path, voice, accent, profile_data)
            if success:
                break
            print(f"    [{turn_index}] Attempt {attempt}/{MAX_RETRIES}: no audio returned")
        except Exception as e:
            print(f"    [{turn_index}] Attempt {attempt}/{MAX_RETRIES} failed: {e}")
            if attempt < MAX_RETRIES:
                time.sleep(2 * attempt)
    else:
        print(f"    [{turn_index}] ✗ All {MAX_RETRIES} attempts failed, skipping")
        return (turn_index, None)

    treatment = get_treatment(speaker, host_name, profiles, config)

    if treatment == "studio":
        os.rename(raw_path, final_path)
        print(f"    [{turn_index}] ✓ {speaker} ({voice}) clean studio")
    else:
        try:
            apply_telephone_filter(
                raw_path,
                final_path,
                boost=boost,
                field=(treatment == "field"),
            )
            print(f"    [{turn_index}] ✓ {speaker} ({voice}) + {treatment} filter")
        except Exception:
            os.rename(raw_path, final_path)
            print(f"    [{turn_index}] ✓ {speaker} ({voice}) (filter failed, using raw)")

    return (turn_index, final_path)


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
    args = parser.parse_args()

    config = load_show_config(args.workspace, args.config)
    host_name = get_host_name(config)
    host_voice = config.get("host", {}).get("voice", "Puck")

    profiles = build_profiles(config)
    profiles.update(build_guest_profiles(config))

    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY", "dummy-key"))

    script_path = os.path.join(args.workspace, "data", "script.md")
    with open(script_path, encoding="utf-8") as f:
        script = f.read()

    turns = split_script_by_turns(script)
    print("=== AI Talk Radio: TTS Generation ===\n")
    print(f"Found {len(turns)} turns (host: {host_name})")
    print(f"Generating in parallel with {args.workers} workers\n")

    segments_dir = os.path.join(args.workspace, "audio", "speech", "segments")
    os.makedirs(segments_dir, exist_ok=True)

    assigned_voices = {host_name: host_voice}
    assigned_accents = {host_name: config.get("host", {}).get("accent", "British English")}
    female_index = 0
    male_index = 0
    prepared_turns = []

    roster_voices, roster_genders, roster_accents = build_roster_lookups(config)

    for i, (speaker, text) in enumerate(turns):
        if speaker == "__marker__":
            prepared_turns.append((i, speaker, text, "", "", False))
            continue

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
            elif gender == "Female":
                assigned_voices[speaker] = FEMALE_VOICES[female_index % len(FEMALE_VOICES)]
                female_index += 1
            else:
                pool = [v for v in MALE_VOICES if v != host_voice or speaker == host_name]
                assigned_voices[speaker] = pool[male_index % len(pool)]
                male_index += 1

        if speaker not in assigned_accents:
            assigned_accents[speaker] = accent

        voice = assigned_voices[speaker]
        accent = assigned_accents[speaker]
        prepared_turns.append((i, speaker, text, voice, accent, boost))
        print(f"  [{i+1}/{len(turns)}] {speaker} ({voice}): {text[:60]}...")

    markers = []
    for i, (speaker, text) in enumerate(turns):
        if speaker == "__marker__":
            markers.append({"index": i, "marker": text})

    markers_path = os.path.join(args.workspace, "data", "script_markers.json")
    with open(markers_path, "w", encoding="utf-8") as f:
        json.dump(markers, f)

    print("\nStarting parallel generation...")
    results = {}

    tts_turns = [(i, s, t, v, a, b) for i, s, t, v, a, b in prepared_turns if s != "__marker__"]

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(
                process_turn,
                client,
                i,
                speaker,
                text,
                voice,
                accent,
                segments_dir,
                profiles,
                host_name,
                config,
                boost,
            ): i
            for i, speaker, text, voice, accent, boost in tts_turns
        }

        for future in as_completed(futures):
            turn_index, final_path = future.result()
            results[turn_index] = final_path

    segment_files = []
    for i, (speaker, _text) in enumerate(turns):
        if speaker == "__marker__":
            continue
        path = results.get(i)
        if path is not None:
            segment_files.append(path)

    output_path = os.path.join(args.workspace, "audio", "speech", "speech.wav")
    concatenate_wav_files(segment_files, output_path)

    if os.path.exists(output_path):
        with wave.open(output_path, "rb") as wf:
            duration = wf.getnframes() / wf.getframerate()
        failed = len(tts_turns) - len(segment_files)
        print("\n✅ TTS complete!")
        print(f"   Output: {output_path}")
        print(f"   Duration: {duration:.1f}s | Segments: {len(segment_files)}/{len(tts_turns)}", end="")
        if failed:
            print(f" ({failed} failed)")
        else:
            print()


if __name__ == "__main__":
    main()
