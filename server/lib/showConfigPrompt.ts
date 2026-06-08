import type { ShowConfig } from "../../src/showConfig.ts";
import { getEnabledFeatures } from "../../src/showConfig.ts";

export function buildAgentPrompt(config: ShowConfig): string {
  const enabledFeatures = getEnabledFeatures(config.features);
  const guestSummary =
    config.guests.mode === "fixed" && config.guests.roster
      ? `${config.guests.roster.length} fixed guests`
      : config.guests.mode === "guided"
        ? `${config.guests.count ?? 2} guided guests`
        : `auto-generated guests (target ${config.guests.count ?? "style default"})`;

  const enabledSegments = config.structure.segments
    .filter((s) => s.enabled)
    .map((s) => s.type)
    .join(", ");

  return `Generate a radio show about: ${config.topic}

CRITICAL: Read and follow workspace/data/show_config.json for ALL customization. The config file has been pre-written to the workspace — do NOT ignore it.

Show parameters:
- Target duration: ${config.durationMinutes} minutes
- Show style: ${config.structure.style}
- Host: ${config.host.name} (${config.host.delivery} delivery, voice: ${config.host.voice})
- Guests: ${guestSummary} (mode: ${config.guests.mode})
- Music mood: ${config.music.mood} (enabled: ${config.music.enabled})
- Tone context: ${config.toneContext}
- Enabled segments: ${enabledSegments}
- Enabled features: ${enabledFeatures.join(", ") || "none"}

Follow the workflow in AGENTS.md exactly, using show_config.json for every skill script that supports --config.

Required command sequence (use these exact flags):
1. Research the topic based on the user's prompt
2. python3 /.agents/skills/script-writing/scripts/generate_script.py --workspace ./workspace --config ./workspace/data/show_config.json
3. python3 /.agents/skills/show-production/scripts/script_review.py --workspace ./workspace --config ./workspace/data/show_config.json
4. python3 /.agents/skills/tts-generation/scripts/generate_tts.py --workspace ./workspace --config ./workspace/data/show_config.json
5. python3 /.agents/skills/music-generation/scripts/generate_music.py --workspace ./workspace --mood ${config.music.mood}
6. python3 /.agents/skills/show-production/scripts/generate_sfx.py --workspace ./workspace --config ./workspace/data/show_config.json
7. python3 /.agents/skills/audio-mixing/scripts/mix_audio.py --workspace ./workspace --config ./workspace/data/show_config.json
8. python3 /.agents/skills/show-production/scripts/quality_check.py --workspace ./workspace --config ./workspace/data/show_config.json
9. python3 /.agents/skills/metadata-generation/scripts/generate_metadata.py --workspace ./workspace --config ./workspace/data/show_config.json
10. python3 /.agents/skills/cover-image-generation/scripts/generate_image.py --workspace ./workspace --metadata ./workspace/data/show_notes.json

Proceed autonomously through all steps. Do not ask for approval.`;
}

export function serializeShowConfig(config: ShowConfig): string {
  return JSON.stringify(config, null, 2);
}
