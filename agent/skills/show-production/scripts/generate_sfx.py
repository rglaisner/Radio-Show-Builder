#!/usr/bin/env python3
"""Generate or synthesize short SFX assets for radio production features."""

import argparse
import json
import math
import os
import struct
import sys
import wave

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
from load_config import load_show_config  # noqa: E402

SAMPLE_RATE = 24000


def write_tone_wav(path, frequencies, duration_sec=0.5, volume=0.3):
    """Generate a simple dual-tone beep WAV."""
    samples = []
    total_samples = int(SAMPLE_RATE * duration_sec)
    for i in range(total_samples):
        t = i / SAMPLE_RATE
        sample = 0.0
        for freq in frequencies:
            sample += math.sin(2 * math.pi * freq * t)
        sample /= len(frequencies)
        envelope = 1.0
        if i < SAMPLE_RATE * 0.05:
            envelope = i / (SAMPLE_RATE * 0.05)
        elif i > total_samples - SAMPLE_RATE * 0.1:
            envelope = (total_samples - i) / (SAMPLE_RATE * 0.1)
        sample *= envelope * volume
        samples.append(int(max(-32767, min(32767, sample * 32767))))

    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(struct.pack(f"<{len(samples)}h", *samples))


def write_stinger_wav(path, duration_sec=2.0):
    """Generate a short ascending stinger tone."""
    samples = []
    total_samples = int(SAMPLE_RATE * duration_sec)
    for i in range(total_samples):
        t = i / SAMPLE_RATE
        progress = i / total_samples
        freq = 440 + progress * 330
        sample = math.sin(2 * math.pi * freq * t) * 0.2
        if i < SAMPLE_RATE * 0.02:
            sample *= i / (SAMPLE_RATE * 0.02)
        elif i > total_samples - SAMPLE_RATE * 0.3:
            sample *= (total_samples - i) / (SAMPLE_RATE * 0.3)
        samples.append(int(max(-32767, min(32767, sample * 32767))))

    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(struct.pack(f"<{len(samples)}h", *samples))


def main():
    parser = argparse.ArgumentParser(description="Generate radio SFX")
    parser.add_argument("--workspace", default="workspace")
    parser.add_argument("--config", default=None)
    args = parser.parse_args()

    config = load_show_config(args.workspace, args.config)
    features = config.get("features", {})

    sfx_dir = os.path.join(args.workspace, "audio", "sfx")
    os.makedirs(sfx_dir, exist_ok=True)

    print("=== AI Talk Radio: SFX Generation ===\n")
    generated = []

    if features.get("phoneConnectSfx"):
        path = os.path.join(sfx_dir, "phone_connect.wav")
        write_tone_wav(path, [440, 480], duration_sec=0.4)
        generated.append("phone_connect.wav")
        print("  ✓ phone_connect.wav")

    if features.get("topicStingers") or features.get("stationId"):
        path = os.path.join(sfx_dir, "stinger.wav")
        write_stinger_wav(path)
        generated.append("stinger.wav")
        print("  ✓ stinger.wav")

    if features.get("holdMusic"):
        path = os.path.join(sfx_dir, "hold_tone.wav")
        write_tone_wav(path, [220, 277], duration_sec=3.0, volume=0.15)
        generated.append("hold_tone.wav")
        print("  ✓ hold_tone.wav")

    manifest_path = os.path.join(sfx_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump({"files": generated}, f)

    if generated:
        print(f"\n✅ Generated {len(generated)} SFX file(s)")
    else:
        print("No SFX features enabled — skipping")


if __name__ == "__main__":
    main()
