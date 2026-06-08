export const PIPELINE_STEP_TOTAL = 11;

export interface GenerationProgress {
  stepIndex: number;
  stepTotal: number;
  stepLabel: string;
  subCurrent?: number;
  subTotal?: number;
  subLabel?: string;
}

export const INITIAL_GENERATION_PROGRESS: GenerationProgress = {
  stepIndex: 0,
  stepTotal: PIPELINE_STEP_TOTAL,
  stepLabel: 'Initializing',
};

const PIPELINE_STEPS: Array<{ index: number; label: string; matchers: string[] }> = [
  { index: 1, label: 'Researching topic', matchers: ['fetch_hn.py', 'fetch_github.py', 'fetch_url.py'] },
  { index: 2, label: 'Writing script', matchers: ['generate_script.py'] },
  { index: 3, label: 'Reviewing script', matchers: ['script_review.py'] },
  { index: 4, label: 'Generating speech', matchers: ['generate_tts.py'] },
  { index: 5, label: 'Generating music', matchers: ['generate_music.py'] },
  { index: 6, label: 'Generating sound effects', matchers: ['generate_sfx.py'] },
  { index: 7, label: 'Mixing audio', matchers: ['mix_audio.py'] },
  { index: 8, label: 'Quality check', matchers: ['quality_check.py'] },
  { index: 9, label: 'Generating metadata', matchers: ['generate_metadata.py'] },
  { index: 10, label: 'Generating cover image', matchers: ['generate_image.py'] },
];

const READ_FILE_HINTS: Array<{ pattern: string; subLabel: string }> = [
  { pattern: 'skills/research', subLabel: 'Preparing research' },
  { pattern: 'skills/script-writing', subLabel: 'Preparing script' },
  { pattern: 'skills/tts-generation', subLabel: 'Preparing speech generation' },
  { pattern: 'skills/music-generation', subLabel: 'Preparing music generation' },
  { pattern: 'skills/audio-mixing', subLabel: 'Preparing audio mixing' },
  { pattern: 'skills/metadata-generation', subLabel: 'Preparing metadata' },
  { pattern: 'skills/cover-image-generation', subLabel: 'Preparing cover image' },
];

function getCommandFromArgs(args: unknown): string {
  if (!args || typeof args !== 'object') return '';
  const record = args as Record<string, unknown>;
  if (typeof record.command === 'string') return record.command;
  if (typeof record.code === 'string') return record.code;
  return '';
}

function getPathFromArgs(args: unknown): string {
  if (!args || typeof args !== 'object') return '';
  const record = args as Record<string, unknown>;
  return typeof record.path === 'string' ? record.path : '';
}

function stepFromCommand(cmd: string): GenerationProgress | null {
  for (const step of PIPELINE_STEPS) {
    if (step.matchers.some((m) => cmd.includes(m))) {
      return {
        stepIndex: step.index,
        stepTotal: PIPELINE_STEP_TOTAL,
        stepLabel: step.label,
      };
    }
  }
  return null;
}

function withClearedSub(progress: GenerationProgress): GenerationProgress {
  return {
    ...progress,
    subCurrent: undefined,
    subTotal: undefined,
    subLabel: undefined,
  };
}

export function progressFromToolCall(name: string, args: unknown): GenerationProgress | null {
  if (name === 'code_execution_call' || name === 'bash') {
    const cmd = getCommandFromArgs(args);
    const match = stepFromCommand(cmd);
    if (match) return withClearedSub(match);
  }

  if (name === 'read_file') {
    const path = getPathFromArgs(args);
    const hint = READ_FILE_HINTS.find((h) => path.includes(h.pattern));
    if (hint) {
      return {
        stepIndex: 0,
        stepTotal: PIPELINE_STEP_TOTAL,
        stepLabel: 'Initializing',
        subLabel: hint.subLabel,
      };
    }
  }

  return null;
}

const TTS_TURN_REGEX = /\[(\d+)\/(\d+)\]/g;
const TTS_SEGMENTS_REGEX = /Segments:\s*(\d+)\/(\d+)/;

function extractToolResultText(name: string, result: string): string {
  try {
    let data: unknown = result.trim();
    for (let i = 0; i < 5; i++) {
      if (typeof data === 'string') {
        const trimmed = data.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"')) {
          data = JSON.parse(trimmed);
        } else {
          break;
        }
      } else if (data && typeof data === 'object' && 'result' in data) {
        data = (data as { result: unknown }).result;
      } else {
        break;
      }
    }
    if (typeof data === 'object' && data !== null && 'output' in data) {
      const output = (data as { output: unknown }).output;
      if (typeof output === 'string') return output;
    }
    if (typeof data === 'string') return data;
  } catch {
    // use raw result
  }
  return result;
}

function parseTtsSubProgress(text: string): Pick<GenerationProgress, 'subCurrent' | 'subTotal' | 'subLabel'> | null {
  const segmentsMatch = text.match(TTS_SEGMENTS_REGEX);
  if (segmentsMatch) {
    const current = Number(segmentsMatch[1]);
    const total = Number(segmentsMatch[2]);
    if (total > 0) {
      return {
        subCurrent: current,
        subTotal: total,
        subLabel: `Processed ${current} of ${total} speech segments`,
      };
    }
  }

  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  const regex = new RegExp(TTS_TURN_REGEX.source, TTS_TURN_REGEX.flags);
  while ((match = regex.exec(text)) !== null) {
    lastMatch = match;
  }

  if (lastMatch) {
    const current = Number(lastMatch[1]);
    const total = Number(lastMatch[2]);
    if (total > 0) {
      return {
        subCurrent: current,
        subTotal: total,
        subLabel: `Processing turn ${current} of ${total}`,
      };
    }
  }

  return null;
}

export function progressFromToolResult(
  name: string,
  result: string,
  current: GenerationProgress
): GenerationProgress {
  if (current.stepIndex !== 4) return current;
  if (name !== 'bash' && name !== 'code_execution_call') return current;

  const text = extractToolResultText(name, result);
  const sub = parseTtsSubProgress(text);
  if (!sub) return current;

  return { ...current, ...sub };
}

export function progressFromInfoMessage(message: string, current: GenerationProgress): GenerationProgress {
  const lower = message.toLowerCase();
  if (
    lower.includes('downloading') ||
    lower.includes('processing final audio') ||
    lower.includes('provisioning environment')
  ) {
    const label = lower.includes('provisioning')
      ? 'Provisioning environment'
      : 'Packaging show';
    return withClearedSub({
      stepIndex: lower.includes('provisioning') ? 0 : PIPELINE_STEP_TOTAL,
      stepTotal: PIPELINE_STEP_TOTAL,
      stepLabel: label,
    });
  }
  return current;
}

export function finalizingProgress(): GenerationProgress {
  return {
    stepIndex: PIPELINE_STEP_TOTAL,
    stepTotal: PIPELINE_STEP_TOTAL,
    stepLabel: 'Finalizing your show',
  };
}

export function getProgressPercent(progress: GenerationProgress, options?: { complete?: boolean; finalizing?: boolean }): number {
  if (options?.complete) return 100;
  if (options?.finalizing) return 95;
  const base = (progress.stepIndex / progress.stepTotal) * 100;
  if (progress.subCurrent !== undefined && progress.subTotal !== undefined && progress.subTotal > 0) {
    const stepSlice = 100 / progress.stepTotal;
    const subFraction = progress.subCurrent / progress.subTotal;
    return Math.min(94, base + stepSlice * subFraction * 0.9);
  }
  return Math.min(94, base);
}
