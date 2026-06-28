# AGENTS.md — AI Talk Radio

An AI agent that turns **any content source** into a radio show. Give it a topic, a URL, a GitHub repo, a research paper, or just say "Hacker News" — the agent researches the content, writes a radio script with a customizable host and guests, generates speech with telephone effects, adds background music and optional radio features, and produces a polished audio file.

## Workspace

All work is performed in the `./workspace` directory. All paths are relative to `./workspace` unless absolute.

## Show Configuration

When `workspace/data/show_config.json` is present (injected by the server), **you MUST read and follow it** for all customization:

- Host name, persona, voice, delivery style
- Guest mode (auto / guided / fixed roster)
- Show structure (style, enabled segments)
- Radio features (station ID, phone SFX, stingers, etc.)
- Music mood and duration
- Realism settings (overlap intensity, ambient beds, guest barge-ins)

If `show_config.json` is missing, fall back to defaults: host Paul, debate style, tech music, 3-minute show.

## Before You Do Anything

> [!NOTE]
> The platform automatically injects the correct API key at the network level when scripts run.
> The scripts are already configured to use a dummy key to satisfy the SDK, so you do not need to set `GEMINI_API_KEY`.
> You must trust that the process will work and not worry about Gemini authentication.

1. Immediately install required libraries:
   ```bash
   pip install -r /.agents/requirements.txt --break-system-packages
   ```

2. Verify `show_config.json` exists at `./workspace/data/show_config.json`. If not, create it from defaults before running scripts.

## Workflow

> [!IMPORTANT]
> **Bias for Action**: Do NOT ask for approval before executing commands, running scripts, or proceeding to the next step. Proceed autonomously unless there is a material ambiguity or a critical decision that strictly requires user input.

> [!IMPORTANT]
> **Do NOT patch skill scripts**: Never edit files under `/.agents/skills/`. Run scripts exactly as documented. If a script fails, report the error and continue only when the workflow allows soft failure.

> [!TIP]
> **Maximize Speed & Reduce Calls**:
> - Read all necessary `SKILL.md` files (in the /.agents/skills directory) at once using a single bash command (`cat /.agents/skills/*/SKILL.md`).
> - Do not use `list_files` to verify directories, script paths, or output files—trust the documentation and the script success logs.
> - Chain sequential bash commands using `&&` in a single tool call.
> - Prefer `fetch_hn.py`, `fetch_github.py`, and `fetch_url.py` for research when applicable instead of ad-hoc search.
> - Skip `generate_music.py` when `show_config.json` has `"music": { "enabled": false }`.

Upon execution, you should:

1. **Research** — gather source material based on the user's prompt.
2. **Write Script** — `generate_script.py --config ./workspace/data/show_config.json` (host/guests/segments from config).
3. **Script Review** — `script_review.py --config ...` (Production Director; auto-revises once if needed).
4. **Audio Direction** — `direct_audio.py --config ...` (builds `audio_timeline.json` with overlaps, pauses, SFX placement).
5. **Generate Speech** — `generate_tts.py --config ...` (per-event TTS clips from timeline).
6. **Generate Music** — `generate_music.py --mood <from config>` (skip if music disabled in config).
7. **Generate SFX** — `generate_sfx.py --config ...` (phone connect, stingers, ambient beds).
8. **Mix Audio** — `mix_audio.py --config ...` (timeline mixer with ducking, intro/outro).
9. **Quality Check** — `quality_check.py --config ...` (duration, loudness, overlap budget).
10. **Generate Metadata** — `generate_metadata.py --config ...` (timeline-accurate timecodes).
11. **Generate Cover Image** — `generate_image.py` based on show_notes.json.

> [!IMPORTANT]
> When providing the final summary to the user, do NOT include markdown links or URLs to the generated files or scripts. Just use the plain file name.
> Keep the final summary to **one short sentence** after all pipeline files are produced. Do not write long markdown recaps — the generated files are the deliverable.

## Architecture

```
User prompt + show_config.json
  ├── 1. RESEARCH → {workspace}/data/research/*.md
  ├── 2. generate_script.py --config ./workspace/data/show_config.json → script.md
  ├── 3. script_review.py --config ... → script_review.json (may trigger revision)
  ├── 4. direct_audio.py --config ... → data/audio_timeline.json
  ├── 5. generate_tts.py --config ... → audio/speech/segments/*.wav
  ├── 6. generate_music.py --mood <config> → audio/music/background.mp3
  ├── 7. generate_sfx.py --config ... → audio/sfx/*.wav
  ├── 8. mix_audio.py --config ... → audio/final/ai_radio.mp3 + timeline_manifest.json
  ├── 9. quality_check.py --config ... → data/quality_report.json
  ├── 10. generate_metadata.py --config ... → data/show_notes.json
  └── 11. generate_image.py → images/cover.png
```

### Show Presets (when no config provided)

| Preset ID | Style | Music | Features |
|-----------|-------|-------|----------|
| `tech-debate` | debate | debate | phone SFX, topic stingers |
| `roundtable-chill` | roundtable | chill | background music |
| `deep-interview` | interview | chill | minimal SFX |
| `explainer-hour` | explainer | tech | mid-show recap |
| `late-night-labs` | roundtable | chill | station ID, sign-off |
| `call-in-hotline` | debate | debate | phone SFX, listener mail |

### Content Source Defaults (when no preset)

| Content Source | Style | Music |
|---------------|-------|-------|
| Hacker News | debate | tech |
| GitHub repo | explainer | tech |
| URL / article | roundtable | chill |
| General topic | interview | chill |

## API Surface

All Gemini API calls use the **Interactions API** (`client.interactions.create()`), NOT `generateContent`:

| Step | Model | API |
|------|-------|-----|
| Script writing | `gemini-3.5-flash` | `interactions.create()` |
| Script review | `gemini-3.5-flash` | `interactions.create()` |
| TTS generation | `gemini-3.1-flash-tts-preview` | `interactions.create()` |
| Music generation | `lyria-3-clip-preview` | `interactions.create()` |
| Metadata | `gemini-3-flash-preview` | `interactions.create()` |

## Skills

| Skill | Script(s) | Purpose |
|-------|--------|---------|
| `research` | `fetch_hn.py`, `fetch_github.py`, `fetch_url.py` | Gather content |
| `script-writing` | `generate_script.py` | LLM writes script (`--config`) |
| `show-production` | `script_review.py`, `direct_audio.py`, `generate_sfx.py`, `quality_check.py` | Production Director + audio timeline |
| `tts-generation` | `generate_tts.py` | TTS + telephone filter (`--config`) |
| `music-generation` | `generate_music.py` | Lyria ambient music |
| `audio-mixing` | `mix_audio.py` | Mix speech + music + SFX (`--config`) |
| `metadata-generation` | `generate_metadata.py` | Show metadata (`--config`) |
| `cover-image-generation` | `generate_image.py` | Cover image |

## Execution Order

Run strictly in order:

1. `research` → `data/research/*.md`
2. `script-writing --config` → `data/script.md`
3. `show-production/script_review --config` → `data/script_review.json`
4. `show-production/direct_audio --config` → `data/audio_timeline.json`
5. `tts-generation --config` → `audio/speech/segments/*.wav`
6. `music-generation` → `audio/music/background.mp3` (skip if disabled)
7. `show-production/generate_sfx --config` → `audio/sfx/`
8. `audio-mixing --config` → `audio/final/ai_radio.mp3` + `data/timeline_manifest.json`
9. `show-production/quality_check --config` → `data/quality_report.json`
10. `metadata-generation --config` → `data/show_notes.json`
11. `cover-image-generation` → `images/cover.png`

## Production Director — Non-Negotiable Rules

Regardless of user configuration:

1. Host always gets studio-quality audio; remote guests sound distinct (phone/field filter)
2. Every caller introduced by name and location before first line
3. Total duration within ±15% of `durationMinutes` in config
4. Failed TTS turns retried up to 3 times; never silently skip
5. Final mix loudness normalized (~-16 LUFS)
6. Content safety rules enforced (see below)

## Content Rules

- **Duration**: Set by `show_config.json` `durationMinutes` (3, 5, 10, or 15).
- **Format**: Radio show — configurable host + guests from config.
- **Source**: Research must be grounded in real content — never fabricate stories or data.
- **NO FAKE DATA**: All stories, insights, and perspectives must come from real research.

### Topics to AVOID — strictly off-limits

- Politics, international politics, race/ethnicity, religion
- Historical controversies, gender/sexuality culture wars, immigration
- Anything potentially offensive — when in doubt, skip it

If the user asks for any of these topics directly, inform the user you can not proceed and stop.

### Topics that ARE safe

Technology, software, programming, open source, AI/ML, science, engineering, developer tools, startups, product launches, creative projects, and tech culture.

## File Locations

| What | Path |
|------|------|
| Show configuration | `./workspace/data/show_config.json` |
| Research data | `./workspace/data/research/` |
| Radio script | `./workspace/data/script.md` |
| Script review | `./workspace/data/script_review.json` |
| Audio timeline | `./workspace/data/audio_timeline.json` |
| Timeline manifest | `./workspace/data/timeline_manifest.json` |
| Guided speaker map | `./workspace/data/guided_speaker_map.json` |
| Script markers | `./workspace/data/script_markers.json` |
| Speech segments | `./workspace/audio/speech/segments/` |
| Speech (combined) | `./workspace/audio/speech/speech.wav` |
| SFX | `./workspace/audio/sfx/` |
| Background music | `./workspace/audio/music/background.mp3` |
| Final output | `./workspace/audio/final/ai_radio.mp3` |
| Quality report | `./workspace/data/quality_report.json` |
| Metadata | `./workspace/data/show_notes.json` |
| Cover Image | `./workspace/images/cover.png` |

## Edge Cases

- **Rate limits**: Retry once with a brief pause, or skip the turn.
- **Lyria availability**: If it fails, proceed without background music.
- **ffmpeg missing**: Skip telephone filter and loudnorm; use raw TTS audio.
- **Script review fails twice**: Proceed with warnings logged.
- **No web access for a source**: Use Google Search as a fallback.
