---
name: audio-mixing
description: Mix timeline-based speech, overlaps, ambient beds, SFX, and music into a polished radio show file.
---

# Audio Mixing

Combine TTS speech clips from `audio_timeline.json` into a single, polished radio show file with realistic overlaps and ducking.

## Embedded Script

```bash
python3 skills/audio-mixing/scripts/mix_audio.py --workspace ./workspace
```

### Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `--workspace` | `workspace` | Root workspace directory |
| `--config` | `show_config.json` | Show configuration path |

### What it does

1. Loads `data/audio_timeline.json` (falls back to legacy concat if missing).
2. Resolves overlap positions from measured clip durations.
3. Overlays speech, interjections, backchannels with ducking on interrupted speakers.
4. Loops ambient beds (room tone, phone hiss) when `realism.ambientBeds` is enabled.
5. Places SFX at timeline positions (including `[hold]`).
6. Mixes background music with sidechain ducking under speech.
7. Exports MP3 and writes `data/timeline_manifest.json`.

### Dependencies

- `pydub`
- `ffmpeg` (system)

## Output

| File | Path | Format |
|------|------|--------|
| MP3 (distribution) | `{workspace}/audio/final/ai_radio.mp3` | MP3, 192kbps |
| Timeline manifest | `{workspace}/data/timeline_manifest.json` | JSON |

## Fallback

If no timeline exists, produces legacy speech-concat mix with intro/outro music only.
