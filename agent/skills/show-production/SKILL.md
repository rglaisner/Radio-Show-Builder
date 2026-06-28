# Show Production Skill

Production quality layer for AI Talk Radio. Ensures scripts and audio meet broadcast standards regardless of user customization.

## Scripts

| Script | Purpose |
|--------|---------|
| `load_config.py` | Shared ShowConfig loader (imported by other skills) |
| `script_review.py` | LLM + deterministic script review before TTS |
| `direct_audio.py` | Build persona-aware `audio_timeline.json` from script |
| `audio_timeline.py` | Timeline schema, validation, manifest helpers |
| `generate_sfx.py` | Generate phone connect, stinger, hold, ambient SFX |
| `quality_check.py` | Final audio QC (duration, loudness, overlap, segments) |

## Usage

```bash
python3 /.agents/skills/show-production/scripts/script_review.py --workspace ./workspace --config ./workspace/data/show_config.json
python3 /.agents/skills/show-production/scripts/direct_audio.py --workspace ./workspace --config ./workspace/data/show_config.json
python3 /.agents/skills/show-production/scripts/generate_sfx.py --workspace ./workspace --config ./workspace/data/show_config.json
python3 /.agents/skills/show-production/scripts/quality_check.py --workspace ./workspace --config ./workspace/data/show_config.json
```

## Audio Timeline Schema

**Input:** `workspace/data/audio_timeline.json` (produced by `direct_audio.py`)

**Output:** `workspace/data/timeline_manifest.json` (resolved ms positions, produced by mixer)

### Event types

| Type | Purpose |
|------|---------|
| `speech` | Normal spoken turn |
| `interjection` | Barge-in overlapping another clip (`overlapOf`, `overlapRatio`) |
| `backchannel` | Low-volume acknowledgment under another speaker |
| `reaction` | Short reactive utterance under speech |
| `pause` | Variable silence gap |
| `ambient` | Looping room tone / phone hiss / murmur |
| `sfx` | One-shot connect, stinger, hold |
| `music` | Background bed with ducking |

### Speech event fields

| Field | Description |
|-------|-------------|
| `id` | Unique event identifier |
| `speaker` | Speaker name |
| `text` | Dialogue (emotional tags preserved for TTS) |
| `clipRef` | Relative path under `workspace/audio/` |
| `startMs` | Absolute placement (sequential events) |
| `overlapOf` | ID of clip this overlaps |
| `overlapRatio` | 0–1 point into base clip where overlap starts |
| `volumeDb` | Gain offset (backchannels typically -14) |
| `duckDb` | How much to duck base clip during overlap (default -6) |
| `duckDuring` | List of event IDs that duck this clip |

## Production Director Rules

1. Host always gets studio-quality audio
2. Callers introduced before first line
3. Duration within ±15% of target
4. Failed TTS turns are retried (in tts-generation)
5. Final mix normalized to ~-16 LUFS
6. Content safety rules enforced in script review
7. Overlap density must respect `realism.intensity` budget
