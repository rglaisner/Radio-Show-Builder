import type { GenerationProgress } from './generationProgress';
import { getProgressPercent } from './generationProgress';
import {
  DEFAULT_FEATURES,
  DEFAULT_REALISM,
  type RadioFeatures,
  type ShowConfig,
} from './showConfig';

const BASE_OVERHEAD_MINUTES = 4;
const MINUTES_PER_SHOW_MINUTE = 1.2;
const MINUTES_PER_EXTRA_GUEST = 0.5;
const MINUTES_PER_HEAVY_FEATURE = 0.5;
const MUSIC_DISABLED_SAVINGS = 0.5;

const HEAVY_FEATURE_KEYS: (keyof RadioFeatures)[] = ['phoneConnectSfx', 'topicStingers'];

export interface GenerationEstimateInput {
  durationMinutes: 3 | 5 | 10 | 15;
  guestCount?: number;
  features?: Partial<RadioFeatures>;
  ambientBeds?: boolean;
  musicEnabled?: boolean;
}

export function resolveGuestCountForEstimate(
  guests: Partial<ShowConfig['guests']> | undefined,
  defaultCount: number
): number {
  if (!guests) return defaultCount;
  if (guests.mode === 'fixed' && guests.roster && guests.roster.length > 0) {
    return guests.roster.length;
  }
  if (typeof guests.count === 'number' && guests.count > 0) {
    return guests.count;
  }
  return defaultCount;
}

export function estimateGenerationMinutes(input: GenerationEstimateInput): number {
  let total = BASE_OVERHEAD_MINUTES + input.durationMinutes * MINUTES_PER_SHOW_MINUTE;

  const guestCount = input.guestCount ?? 2;
  if (guestCount > 1) {
    total += (guestCount - 1) * MINUTES_PER_EXTRA_GUEST;
  }

  const features = { ...DEFAULT_FEATURES, ...input.features };
  for (const key of HEAVY_FEATURE_KEYS) {
    if (features[key]) {
      total += MINUTES_PER_HEAVY_FEATURE;
    }
  }

  const ambientBeds = input.ambientBeds ?? DEFAULT_REALISM.ambientBeds;
  if (ambientBeds) {
    total += MINUTES_PER_HEAVY_FEATURE;
  }

  const musicEnabled = input.musicEnabled ?? true;
  if (!musicEnabled) {
    total -= MUSIC_DISABLED_SAVINGS;
  }

  return Math.max(1, Math.round(total));
}

export function formatEstimateLabel(minutes: number): string {
  return `~${minutes} min${minutes === 1 ? '' : 's'}`;
}

export function formatRemainingLabel(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins > 0) return `~${mins}m left`;
  return `~${secs}s left`;
}

export function estimateFromShowConfig(
  config: Pick<ShowConfig, 'durationMinutes' | 'guests' | 'features' | 'realism' | 'music'>,
  defaultGuestCount = 2
): number {
  return estimateGenerationMinutes({
    durationMinutes: config.durationMinutes,
    guestCount: resolveGuestCountForEstimate(config.guests, defaultGuestCount),
    features: config.features,
    ambientBeds: config.realism?.ambientBeds,
    musicEnabled: config.music?.enabled,
  });
}

export function estimateFromFormState(input: {
  durationMinutes: 3 | 5 | 10 | 15;
  overrides?: Partial<ShowConfig>;
  defaultGuestCount?: number;
}): number {
  const overrides = input.overrides ?? {};
  return estimateGenerationMinutes({
    durationMinutes: input.durationMinutes,
    guestCount: resolveGuestCountForEstimate(
      overrides.guests,
      input.defaultGuestCount ?? 2
    ),
    features: overrides.features,
    ambientBeds: overrides.realism?.ambientBeds,
    musicEnabled: overrides.music?.enabled,
  });
}

export function estimateRemainingMs(
  elapsedMs: number,
  progress: GenerationProgress,
  options?: { finalizing?: boolean }
): number | null {
  const pct = getProgressPercent(progress, { finalizing: options?.finalizing });
  if (pct < 5) return null;
  return Math.max(0, (elapsedMs / pct) * (100 - pct));
}
