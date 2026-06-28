export const PIPELINE_STEP_TOTAL = 12;

export interface PipelineStep {
  index: number;
  label: string;
  matchers: string[];
  artifactPaths: string[];
}

/** Agent pipeline steps 1–11 (UI step 12 is server packaging). */
export const PIPELINE_STEPS: PipelineStep[] = [
  {
    index: 1,
    label: 'Researching topic',
    matchers: ['fetch_hn.py', 'fetch_github.py', 'fetch_url.py'],
    artifactPaths: ['workspace/data/research'],
  },
  {
    index: 2,
    label: 'Writing script',
    matchers: ['generate_script.py'],
    artifactPaths: ['workspace/data/script.md'],
  },
  {
    index: 3,
    label: 'Reviewing script',
    matchers: ['script_review.py'],
    artifactPaths: ['workspace/data/script_review.json'],
  },
  {
    index: 4,
    label: 'Planning audio timeline',
    matchers: ['direct_audio.py'],
    artifactPaths: ['workspace/data/audio_timeline.json'],
  },
  {
    index: 5,
    label: 'Generating speech',
    matchers: ['generate_tts.py'],
    artifactPaths: ['workspace/audio/speech'],
  },
  {
    index: 6,
    label: 'Generating music',
    matchers: ['generate_music.py'],
    artifactPaths: ['workspace/audio/music/background.mp3'],
  },
  {
    index: 7,
    label: 'Generating sound effects',
    matchers: ['generate_sfx.py'],
    artifactPaths: ['workspace/audio/sfx'],
  },
  {
    index: 8,
    label: 'Mixing audio',
    matchers: ['mix_audio.py'],
    artifactPaths: ['workspace/audio/final/ai_radio.mp3'],
  },
  {
    index: 9,
    label: 'Quality check',
    matchers: ['quality_check.py'],
    artifactPaths: ['workspace/data/quality_report.json'],
  },
  {
    index: 10,
    label: 'Generating metadata',
    matchers: ['generate_metadata.py'],
    artifactPaths: ['workspace/data/show_notes.json'],
  },
  {
    index: 11,
    label: 'Generating cover image',
    matchers: ['generate_image.py'],
    artifactPaths: ['workspace/images/cover.png'],
  },
];

export function getCommandFromArgs(args: unknown): string {
  if (!args || typeof args !== 'object') return '';
  const record = args as Record<string, unknown>;
  if (typeof record.command === 'string') return record.command;
  if (typeof record.code === 'string') return record.code;
  return '';
}

export function stepIndexFromCommand(cmd: string): number | null {
  for (const step of PIPELINE_STEPS) {
    if (step.matchers.some((matcher) => cmd.includes(matcher))) {
      return step.index;
    }
  }
  return null;
}

export function stepIndexFromToolCall(name: string, args: unknown): number | null {
  if (name === 'code_execution_call' || name === 'bash') {
    return stepIndexFromCommand(getCommandFromArgs(args));
  }
  return null;
}

function filePathMatches(files: Record<string, Buffer>, target: string): boolean {
  const normalized = target.replace(/^\.\//, '');
  return Object.keys(files).some(
    (filePath) =>
      filePath === target ||
      filePath === normalized ||
      filePath.endsWith(`/${normalized}`) ||
      filePath.includes(normalized)
  );
}

export function detectCompletedStepFromFiles(files: Record<string, Buffer>): number {
  let highest = 0;
  for (const step of PIPELINE_STEPS) {
    const hasArtifact = step.artifactPaths.some((artifactPath) => filePathMatches(files, artifactPath));
    if (hasArtifact) {
      highest = Math.max(highest, step.index);
    }
  }
  return highest;
}
