#!/usr/bin/env python3
"""Generate show metadata (JSON) from audio and transcript using the Interactions API.

Usage:
    python3 generate_metadata.py --workspace ./workspace

Requires:
    pip install google-genai pydub

Output:
    {workspace}/data/show_notes.json
"""

import argparse
import os
import json
import re
import sys
from datetime import datetime
from google import genai
from pydub import AudioSegment

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(SCRIPT_DIR, "..", "..", "show-production", "scripts"))
from load_config import get_enabled_features, get_host_name, load_show_config  # noqa: E402

def make_fallback_metadata(transcript_text, duration_str, today_date, output_path):
    print("Creating a premium local fallback metadata file...")
    turns = []
    lines = transcript_text.strip().split('\n')
    current_seconds = 0
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if ':' in line:
            parts = line.split(':')
            speaker = parts[0].strip()
            text = ':'.join(parts[1:]).strip()
            
            cleaned_text = re.sub(r'\[.*?\]', '', text).strip()
            
            minutes = current_seconds // 60
            seconds = current_seconds % 60
            timecode = f"{minutes:02d}:{seconds:02d}"
            
            turns.append({
                "timecode": timecode,
                "speaker": speaker,
                "text": cleaned_text
            })
            
            current_seconds += 15  # Increment estimate roughly for turns

    fallback_data = {
        "show_title": "AI Talk Radio Broadcast",
        "show_duration": duration_str,
        "two_sentence_summary": "In this automated broadcast, host Paul and guest callers debate current events, technological boundaries, and contrarian perspectives.",
        "date_of_generation": today_date,
        "timecoded_transcript": turns
    }
    
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(fallback_data, f, indent=2)
    print(f"✅ Local fallback metadata saved successfully to {output_path}")

def parse_script_speakers(script_text, host_name):
    """Extract unique non-host speaker names from script.md."""
    speakers = []
    seen = set()
    for line in script_text.strip().split("\n"):
        line = line.strip()
        if not line or line.startswith("#") or line in ("[connect]", "[stinger]", "[hold]"):
            continue
        if ":" not in line:
            continue
        speaker = line.split(":")[0].strip()
        if speaker == host_name or speaker in seen:
            continue
        seen.add(speaker)
        speakers.append(speaker)
    return speakers


def sanitize_guest_profiles(roster):
    """Return roster profiles safe for metadata output."""
    profiles = []
    for guest in roster or []:
        profiles.append({
            "name": guest.get("name"),
            "persona": guest.get("persona"),
            "accent": guest.get("accent"),
            "delivery": guest.get("delivery"),
            "location": guest.get("location"),
            "gender": guest.get("gender"),
            "voice": guest.get("voice"),
            "audioTreatment": guest.get("audioTreatment"),
        })
    return profiles


def enrich_metadata(json_data, config, workspace):
    """Add generation config, speakers, and quality report to metadata."""
    host_name = get_host_name(config)
    host = config.get("host", {})
    host_voice = host.get("voice", "Puck")
    guests_config = config.get("guests", {})
    roster = guests_config.get("roster", [])

    roster_by_name = {
        guest["name"]: guest
        for guest in roster
        if guest.get("name")
    }

    speakers = [{
        "name": host_name,
        "role": "host",
        "voice": host_voice,
        "accent": host.get("accent"),
        "delivery": host.get("delivery"),
    }]

    script_path = os.path.join(workspace, "data", "script.md")
    script_speakers = []
    if os.path.exists(script_path):
        with open(script_path, encoding="utf-8") as f:
            script_speakers = parse_script_speakers(f.read(), host_name)

    guest_names = script_speakers or [
        guest["name"] for guest in roster if guest.get("name")
    ]

    for name in guest_names:
        roster_guest = roster_by_name.get(name, {})
        speakers.append({
            "name": name,
            "role": "guest",
            "voice": roster_guest.get("voice"),
            "accent": roster_guest.get("accent"),
            "delivery": roster_guest.get("delivery"),
            "audioTreatment": roster_guest.get("audioTreatment", "phone"),
        })

    json_data["generation_config"] = {
        "presetId": config.get("presetId"),
        "style": config.get("structure", {}).get("style"),
        "hostName": host_name,
        "guestMode": guests_config.get("mode"),
        "guestCount": guests_config.get("count"),
        "guestProfiles": sanitize_guest_profiles(roster),
        "durationMinutes": config.get("durationMinutes"),
        "mood": config.get("mood"),
    }
    json_data["speakers"] = speakers
    json_data["features_enabled"] = get_enabled_features(config)

    quality_path = os.path.join(workspace, "data", "quality_report.json")
    if os.path.exists(quality_path):
        with open(quality_path, encoding="utf-8") as f:
            json_data["quality_report"] = json.load(f)

    return json_data


def main():
    parser = argparse.ArgumentParser(description="Generate AI Talk Radio show metadata")
    parser.add_argument("--workspace", default="workspace", help="Workspace directory")
    parser.add_argument("--config", default=None, help="Path to show_config.json")
    args = parser.parse_args()

    config = load_show_config(args.workspace, args.config)
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY", "dummy-key"))

    # Paths
    transcript_path = os.path.join(args.workspace, "data", "script.md")
    audio_mp3 = os.path.join(args.workspace, "audio", "final", "ai_radio.mp3")
    audio_wav = os.path.join(args.workspace, "audio", "final", "ai_radio.wav")
    output_path = os.path.join(args.workspace, "data", "show_notes.json")

    # Check inputs
    if not os.path.exists(transcript_path):
        print(f"ERROR: Transcript not found at {transcript_path}")
        return

    audio_path = None
    if os.path.exists(audio_mp3):
        audio_path = audio_mp3
    elif os.path.exists(audio_wav):
        audio_path = audio_wav

    if not audio_path:
        print(f"ERROR: Audio file not found in {os.path.dirname(audio_mp3)}")
        return

    print("=== AI Talk Radio: Metadata Generation ===\n")
    print(f"Transcript: {transcript_path}")
    print(f"Audio: {audio_path}")

    # Read transcript
    with open(transcript_path, "r") as f:
        transcript_text = f.read()

    # Get duration via pydub
    duration_str = "Unknown"
    try:
        audio = AudioSegment.from_file(audio_path)
        duration_seconds = len(audio) / 1000.0
        duration_str = f"{int(duration_seconds // 60):02d}:{int(duration_seconds % 60):02d}"
        print(f"Audio duration: {duration_str}")
    except Exception as e:
        print(f"Warning: Could not determine duration via pydub: {e}")

    # Upload audio to Gemini Files API
    print("Uploading audio to Gemini Files API...")
    today_date = datetime.now().strftime("%Y-%m-%d")
    uploaded_file = None
    try:
        uploaded_file = client.files.upload(file=audio_path)
        print(f"Uploaded file URI: {uploaded_file.uri}")
    except Exception as e:
        print(f"ERROR: Failed to upload audio: {e}")
        make_fallback_metadata(transcript_text, duration_str, today_date, output_path)
        return

    prompt = f"""You are an AI assistant analyzing a radio show production.
You are provided with the audio file of the show and the text transcript.

Based on the audio and transcript, generate a JSON object containing the following information:
1. `show_title`: A catchy title for this show episode (maximum of 5 words).
2. `show_duration`: The duration of the show (use "{duration_str}" if accurate, or estimate from audio).
3. `two_sentence_summary`: A two-sentence summary of the show's content.
4. `date_of_generation`: The date this show was generated (use "{today_date}").
5. `timecoded_transcript`: A list of objects, each containing:
    - `timecode`: The approximate timecode when this line starts (in MM:SS format).
    - `speaker`: The name of the speaker.
    - `text`: The text spoken.

The transcript provided is:
{transcript_text}

You MUST align the transcript with the audio to provide accurate timecodes. Callers usually have a telephone effect.

Return ONLY a valid JSON object. Do NOT wrap it in markdown code blocks. Ensure the output is parseable by json.loads.
"""

    print("Calling Gemini via Interactions API...")
    try:
        interaction = client.interactions.create(
            model="gemini-3-flash-preview",
            input=[
                {"type": "text", "text": prompt},
                {
                    "type": "audio",
                    "uri": uploaded_file.uri,
                    "mime_type": "audio/mpeg" if audio_path.endswith(".mp3") else "audio/wav"
                }
            ]
        )

        # Access response
        response_text = ""
        if hasattr(interaction, "steps") and interaction.steps and interaction.steps[-1].content:
            response_text = interaction.steps[-1].content[0].text
        else:
             print("ERROR: No output received from Gemini.")
             make_fallback_metadata(transcript_text, duration_str, today_date, output_path)
             return

        # Clean up potential markdown wrapping if Gemini ignored the instruction
        response_text = response_text.strip()
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        response_text = response_text.strip()

        # Validate JSON
        try:
            json_data = json.loads(response_text)
            json_data = enrich_metadata(json_data, config, args.workspace)

            # Save
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            with open(output_path, "w") as f:
                json.dump(json_data, f, indent=2)

            print(f"✅ Metadata saved to {output_path}")

        except json.JSONDecodeError as e:
            print(f"ERROR: Failed to parse JSON response: {e}")
            print("Raw response was:")
            print(response_text)
            make_fallback_metadata(transcript_text, duration_str, today_date, output_path)

    except Exception as e:
        print(f"ERROR: API call failed: {e}")
        make_fallback_metadata(transcript_text, duration_str, today_date, output_path)

if __name__ == "__main__":
    main()
