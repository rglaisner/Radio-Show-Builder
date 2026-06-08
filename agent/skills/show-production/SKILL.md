# Show Production Skill

Production quality layer for AI Talk Radio. Ensures scripts and audio meet broadcast standards regardless of user customization.

## Scripts

| Script | Purpose |
|--------|---------|
| `load_config.py` | Shared ShowConfig loader (imported by other skills) |
| `script_review.py` | LLM + deterministic script review before TTS |
| `generate_sfx.py` | Generate phone connect, stinger, hold SFX |
| `quality_check.py` | Final audio QC (duration, loudness, segments) |

## Usage

```bash
python3 /.agents/skills/show-production/scripts/script_review.py --workspace ./workspace --config ./workspace/data/show_config.json
python3 /.agents/skills/show-production/scripts/generate_sfx.py --workspace ./workspace --config ./workspace/data/show_config.json
python3 /.agents/skills/show-production/scripts/quality_check.py --workspace ./workspace --config ./workspace/data/show_config.json
```

## Production Director Rules

1. Host always gets studio-quality audio
2. Callers introduced before first line
3. Duration within ±15% of target
4. Failed TTS turns are retried (in tts-generation)
5. Final mix normalized to ~-16 LUFS
6. Content safety rules enforced in script review
