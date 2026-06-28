import type { ShowConfig } from "../../src/showConfig.ts";
import { PIPELINE_STEPS } from "../../src/pipelineSteps.ts";

const RESUME_COMMANDS: Record<number, string[]> = {
  1: [
    "python3 /.agents/skills/script-writing/scripts/generate_script.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/show-production/scripts/script_review.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/show-production/scripts/direct_audio.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/tts-generation/scripts/generate_tts.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/music-generation/scripts/generate_music.py --workspace ./workspace --mood",
    "python3 /.agents/skills/show-production/scripts/generate_sfx.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/audio-mixing/scripts/mix_audio.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/show-production/scripts/quality_check.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/metadata-generation/scripts/generate_metadata.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/cover-image-generation/scripts/generate_image.py --workspace ./workspace --metadata ./workspace/data/show_notes.json",
  ],
  2: [
    "python3 /.agents/skills/show-production/scripts/script_review.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/show-production/scripts/direct_audio.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/tts-generation/scripts/generate_tts.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/music-generation/scripts/generate_music.py --workspace ./workspace --mood",
    "python3 /.agents/skills/show-production/scripts/generate_sfx.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/audio-mixing/scripts/mix_audio.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/show-production/scripts/quality_check.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/metadata-generation/scripts/generate_metadata.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/cover-image-generation/scripts/generate_image.py --workspace ./workspace --metadata ./workspace/data/show_notes.json",
  ],
  3: [
    "python3 /.agents/skills/show-production/scripts/direct_audio.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/tts-generation/scripts/generate_tts.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/music-generation/scripts/generate_music.py --workspace ./workspace --mood",
    "python3 /.agents/skills/show-production/scripts/generate_sfx.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/audio-mixing/scripts/mix_audio.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/show-production/scripts/quality_check.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/metadata-generation/scripts/generate_metadata.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/cover-image-generation/scripts/generate_image.py --workspace ./workspace --metadata ./workspace/data/show_notes.json",
  ],
  4: [
    "python3 /.agents/skills/tts-generation/scripts/generate_tts.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/music-generation/scripts/generate_music.py --workspace ./workspace --mood",
    "python3 /.agents/skills/show-production/scripts/generate_sfx.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/audio-mixing/scripts/mix_audio.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/show-production/scripts/quality_check.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/metadata-generation/scripts/generate_metadata.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/cover-image-generation/scripts/generate_image.py --workspace ./workspace --metadata ./workspace/data/show_notes.json",
  ],
  5: [
    "python3 /.agents/skills/music-generation/scripts/generate_music.py --workspace ./workspace --mood",
    "python3 /.agents/skills/show-production/scripts/generate_sfx.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/audio-mixing/scripts/mix_audio.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/show-production/scripts/quality_check.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/metadata-generation/scripts/generate_metadata.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/cover-image-generation/scripts/generate_image.py --workspace ./workspace --metadata ./workspace/data/show_notes.json",
  ],
  6: [
    "python3 /.agents/skills/show-production/scripts/generate_sfx.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/audio-mixing/scripts/mix_audio.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/show-production/scripts/quality_check.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/metadata-generation/scripts/generate_metadata.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/cover-image-generation/scripts/generate_image.py --workspace ./workspace --metadata ./workspace/data/show_notes.json",
  ],
  7: [
    "python3 /.agents/skills/audio-mixing/scripts/mix_audio.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/show-production/scripts/quality_check.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/metadata-generation/scripts/generate_metadata.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/cover-image-generation/scripts/generate_image.py --workspace ./workspace --metadata ./workspace/data/show_notes.json",
  ],
  8: [
    "python3 /.agents/skills/show-production/scripts/quality_check.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/metadata-generation/scripts/generate_metadata.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/cover-image-generation/scripts/generate_image.py --workspace ./workspace --metadata ./workspace/data/show_notes.json",
  ],
  9: [
    "python3 /.agents/skills/metadata-generation/scripts/generate_metadata.py --workspace ./workspace --config ./workspace/data/show_config.json",
    "python3 /.agents/skills/cover-image-generation/scripts/generate_image.py --workspace ./workspace --metadata ./workspace/data/show_notes.json",
  ],
  10: [
    "python3 /.agents/skills/cover-image-generation/scripts/generate_image.py --workspace ./workspace --metadata ./workspace/data/show_notes.json",
  ],
};

function getStepLabel(stepIndex: number): string {
  return PIPELINE_STEPS.find((step) => step.index === stepIndex)?.label ?? `Step ${stepIndex}`;
}

export function buildResumePrompt(config: ShowConfig, lastCompletedStep: number): string {
  const resumeFrom = Math.min(lastCompletedStep + 1, 11);
  const commands =
    RESUME_COMMANDS[lastCompletedStep] ??
    RESUME_COMMANDS[Math.max(0, lastCompletedStep - 1)] ??
    RESUME_COMMANDS[10];

  const commandList = commands
    .map((cmd, index) => {
      const resolved = cmd.includes("--mood")
        ? `${cmd} ${config.music.mood}`
        : cmd;
      return `${index + 1}. ${resolved}`;
    })
    .join("\n");

  return `RESUME MODE: The previous radio show generation failed after completing step ${lastCompletedStep} (${getStepLabel(lastCompletedStep)}).

CRITICAL RULES:
- Do NOT redo steps 1 through ${lastCompletedStep}. Those artifacts should already exist in ./workspace.
- Verify existing files before running new commands. Only run the remaining steps below.
- Follow AGENTS.md for all script flags and workspace paths.
- Read workspace/data/show_config.json for customization.
- Do NOT write a long final summary. When all files are produced, reply with one short sentence only.

Topic: ${config.topic}
Target duration: ${config.durationMinutes} minutes

Run ONLY these remaining commands (in order):
${commandList}

Resume from step ${resumeFrom}. Proceed autonomously. Do not ask for approval.`;
}
