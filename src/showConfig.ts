import { z } from "zod";

export const TOPIC_MAX_LENGTH = 10_000;

export const GEMINI_VOICES = ["Puck", "Kore", "Charon", "Fenrir"] as const;
export type GeminiVoice = (typeof GEMINI_VOICES)[number];

export const SHOW_STYLES = ["debate", "roundtable", "interview", "explainer"] as const;
export type ShowStyle = (typeof SHOW_STYLES)[number];

export const GUEST_MODES = ["auto", "guided", "fixed"] as const;
export type GuestMode = (typeof GUEST_MODES)[number];

export const HOST_DELIVERIES = ["measured", "energetic", "late-night", "hype"] as const;
export type HostDelivery = (typeof HOST_DELIVERIES)[number];

export const MUSIC_MOODS = ["chill", "tech", "debate"] as const;
export type MusicMood = (typeof MUSIC_MOODS)[number];

export const UI_MOODS = [
  "Informative",
  "Conversational",
  "Late Night Chill",
  "Hype & Energetic",
  "Experimental",
] as const;
export type UiMood = (typeof UI_MOODS)[number];

export const SEGMENT_TYPES = [
  "coldOpen",
  "intro",
  "main",
  "midShowRecap",
  "newsFlash",
  "listenerMail",
  "closing",
  "stationId",
] as const;
export type SegmentType = (typeof SEGMENT_TYPES)[number];

export const AUDIO_TREATMENTS = ["phone", "studio", "field"] as const;
export type AudioTreatment = (typeof AUDIO_TREATMENTS)[number];

export const GUEST_GENDERS = ["male", "female", "unspecified"] as const;
export type GuestGender = (typeof GUEST_GENDERS)[number];

export const RADIO_FEATURE_KEYS = [
  "stationId",
  "phoneConnectSfx",
  "topicStingers",
  "coHost",
  "fieldReporter",
  "mockSponsorRead",
  "listenerMail",
  "midShowRecap",
  "signOffCatchphrase",
  "backgroundMusic",
  "holdMusic",
] as const;
export type RadioFeatureKey = (typeof RADIO_FEATURE_KEYS)[number];

const guestProfileSchema = z.object({
  name: z.string().optional(),
  persona: z.string().optional(),
  location: z.string().optional(),
  gender: z.enum(GUEST_GENDERS).default("unspecified"),
  voice: z.enum(GEMINI_VOICES).optional(),
  audioTreatment: z.enum(AUDIO_TREATMENTS).default("phone"),
});

const segmentConfigSchema = z.object({
  type: z.enum(SEGMENT_TYPES),
  enabled: z.boolean().default(true),
  durationSeconds: z.number().min(5).max(120).optional(),
});

const radioFeaturesSchema = z.object({
  stationId: z.boolean().default(false),
  phoneConnectSfx: z.boolean().default(false),
  topicStingers: z.boolean().default(false),
  coHost: z.boolean().default(false),
  fieldReporter: z.boolean().default(false),
  mockSponsorRead: z.boolean().default(false),
  listenerMail: z.boolean().default(false),
  midShowRecap: z.boolean().default(false),
  signOffCatchphrase: z.boolean().default(false),
  signOffPhrase: z.string().optional(),
  backgroundMusic: z.boolean().default(true),
  holdMusic: z.boolean().default(false),
});

export const showConfigSchema = z
  .object({
    version: z.literal(1).default(1),
    topic: z.string().min(1).max(TOPIC_MAX_LENGTH),
    durationMinutes: z.union([z.literal(3), z.literal(5), z.literal(10), z.literal(15)]),
    presetId: z.string().optional(),
    mood: z.enum(UI_MOODS).default("Informative"),
    host: z.object({
      name: z.string().min(1).max(40).default("Paul"),
      persona: z.string().max(500).default("Professional, warm British community radio host"),
      accent: z.string().max(200).default("British English accent as heard in London, England"),
      voice: z.enum(GEMINI_VOICES).default("Puck"),
      delivery: z.enum(HOST_DELIVERIES).default("measured"),
    }),
    guests: z.object({
      mode: z.enum(GUEST_MODES).default("auto"),
      count: z.number().int().min(1).max(6).optional(),
      roster: z.array(guestProfileSchema).max(6).optional(),
    }),
    structure: z.object({
      style: z.enum(SHOW_STYLES).default("debate"),
      segments: z.array(segmentConfigSchema).default([]),
    }),
    features: radioFeaturesSchema,
    music: z.object({
      mood: z.enum(MUSIC_MOODS).default("tech"),
      enabled: z.boolean().default(true),
    }),
    toneContext: z.string().max(500).default(""),
  })
  .superRefine((config, ctx) => {
    if (config.guests.mode === "fixed" && (!config.guests.roster || config.guests.roster.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Fixed guest mode requires at least one guest in roster",
        path: ["guests", "roster"],
      });
    }
    if (config.guests.mode === "guided" && !config.guests.count) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Guided guest mode requires a guest count",
        path: ["guests", "count"],
      });
    }
  });

export type GuestProfile = z.infer<typeof guestProfileSchema>;
export type SegmentConfig = z.infer<typeof segmentConfigSchema>;
export type RadioFeatures = z.infer<typeof radioFeaturesSchema>;
export type ShowConfig = z.infer<typeof showConfigSchema>;

export interface ShowPreset {
  id: string;
  name: string;
  description: string;
  partial: Partial<ShowConfig>;
}

export const MOOD_MAPPING: Record<
  UiMood,
  { toneContext: string; musicMood: MusicMood; suggestedStyle: ShowStyle }
> = {
  Informative: {
    toneContext: "clear, educational, and well-structured",
    musicMood: "tech",
    suggestedStyle: "explainer",
  },
  Conversational: {
    toneContext: "friendly, relaxed, and approachable",
    musicMood: "chill",
    suggestedStyle: "roundtable",
  },
  "Late Night Chill": {
    toneContext: "intimate, unhurried, and reflective",
    musicMood: "chill",
    suggestedStyle: "interview",
  },
  "Hype & Energetic": {
    toneContext: "fast-paced, enthusiastic, and high-energy",
    musicMood: "debate",
    suggestedStyle: "debate",
  },
  Experimental: {
    toneContext: "playful, unconventional, and creative",
    musicMood: "tech",
    suggestedStyle: "roundtable",
  },
};

export const DEFAULT_SEGMENTS: SegmentConfig[] = [
  { type: "coldOpen", enabled: true, durationSeconds: 10 },
  { type: "intro", enabled: true, durationSeconds: 15 },
  { type: "main", enabled: true },
  { type: "closing", enabled: true, durationSeconds: 15 },
];

export const DEFAULT_FEATURES: RadioFeatures = {
  stationId: false,
  phoneConnectSfx: false,
  topicStingers: false,
  coHost: false,
  fieldReporter: false,
  mockSponsorRead: false,
  listenerMail: false,
  midShowRecap: false,
  signOffCatchphrase: false,
  backgroundMusic: true,
  holdMusic: false,
};

export const SHOW_PRESETS: ShowPreset[] = [
  {
    id: "tech-debate",
    name: "Tech Debate",
    description: "Two opposing callers debate the hottest tech stories",
    partial: {
      presetId: "tech-debate",
      structure: { style: "debate", segments: DEFAULT_SEGMENTS },
      host: {
        name: "Paul",
        persona: "Calm, measured British moderator who keeps debates fair",
        accent: "British English accent as heard in London, England",
        voice: "Puck",
        delivery: "measured",
      },
      guests: { mode: "auto", count: 2 },
      features: {
        ...DEFAULT_FEATURES,
        phoneConnectSfx: true,
        topicStingers: true,
      },
      music: { mood: "debate", enabled: true },
    },
  },
  {
    id: "roundtable-chill",
    name: "Roundtable Chill",
    description: "Relaxed panel riffing on ideas from multiple angles",
    partial: {
      presetId: "roundtable-chill",
      structure: { style: "roundtable", segments: DEFAULT_SEGMENTS },
      host: {
        name: "Paul",
        persona: "Conversational facilitator who draws out diverse perspectives",
        accent: "British English accent as heard in London, England",
        voice: "Puck",
        delivery: "measured",
      },
      guests: { mode: "auto", count: 4 },
      features: { ...DEFAULT_FEATURES, backgroundMusic: true },
      music: { mood: "chill", enabled: true },
    },
  },
  {
    id: "deep-interview",
    name: "Deep Interview",
    description: "One-on-one Q&A with a knowledgeable guest",
    partial: {
      presetId: "deep-interview",
      structure: { style: "interview", segments: DEFAULT_SEGMENTS },
      host: {
        name: "Paul",
        persona: "Curious, warm interviewer who asks probing follow-ups",
        accent: "British English accent as heard in London, England",
        voice: "Puck",
        delivery: "measured",
      },
      guests: { mode: "guided", count: 1 },
      features: DEFAULT_FEATURES,
      music: { mood: "chill", enabled: true },
    },
  },
  {
    id: "explainer-hour",
    name: "Explainer Hour",
    description: "Collaborative breakdown of complex topics",
    partial: {
      presetId: "explainer-hour",
      structure: {
        style: "explainer",
        segments: [
          ...DEFAULT_SEGMENTS.slice(0, 3),
          { type: "midShowRecap", enabled: true, durationSeconds: 30 },
          DEFAULT_SEGMENTS[3],
        ],
      },
      host: {
        name: "Paul",
        persona: "Patient teacher who makes complex ideas accessible",
        accent: "British English accent as heard in London, England",
        voice: "Puck",
        delivery: "measured",
      },
      guests: { mode: "auto", count: 3 },
      features: { ...DEFAULT_FEATURES, midShowRecap: true },
      music: { mood: "tech", enabled: true },
    },
  },
  {
    id: "late-night-labs",
    name: "Late Night Labs",
    description: "Intimate late-night show with dry wit and station branding",
    partial: {
      presetId: "late-night-labs",
      structure: { style: "roundtable", segments: DEFAULT_SEGMENTS },
      host: {
        name: "Paul",
        persona: "Late-night host with dry wit and unhurried delivery",
        accent: "British English accent as heard in London, England",
        voice: "Charon",
        delivery: "late-night",
      },
      guests: { mode: "auto", count: 2 },
      features: {
        ...DEFAULT_FEATURES,
        stationId: true,
        signOffCatchphrase: true,
        signOffPhrase: "Thanks for listening — see you on the airwaves.",
      },
      music: { mood: "chill", enabled: true },
      mood: "Late Night Chill",
    },
  },
  {
    id: "call-in-hotline",
    name: "Call-In Hotline",
    description: "High-energy call-in show with listener questions",
    partial: {
      presetId: "call-in-hotline",
      structure: { style: "debate", segments: DEFAULT_SEGMENTS },
      host: {
        name: "Paul",
        persona: "Energetic host who keeps the phones ringing",
        accent: "British English accent as heard in London, England",
        voice: "Fenrir",
        delivery: "hype",
      },
      guests: { mode: "guided", count: 4 },
      features: {
        ...DEFAULT_FEATURES,
        phoneConnectSfx: true,
        listenerMail: true,
      },
      music: { mood: "debate", enabled: true },
      mood: "Hype & Energetic",
    },
  },
];

const STYLE_GUEST_LIMITS: Record<ShowStyle, { min: number; max: number }> = {
  debate: { min: 2, max: 6 },
  roundtable: { min: 3, max: 6 },
  interview: { min: 1, max: 3 },
  explainer: { min: 2, max: 4 },
};

export function clampGuestCount(style: ShowStyle, count: number): number {
  const limits = STYLE_GUEST_LIMITS[style];
  return Math.max(limits.min, Math.min(limits.max, count));
}

export function getDefaultGuestCount(style: ShowStyle): number {
  const limits = STYLE_GUEST_LIMITS[style];
  if (style === "debate") return 2;
  if (style === "roundtable") return 4;
  if (style === "interview") return 1;
  return 3;
}

export function buildShowConfig(input: {
  topic: string;
  durationMinutes: 3 | 5 | 10 | 15;
  mood?: UiMood;
  presetId?: string;
  overrides?: Partial<ShowConfig>;
}): ShowConfig {
  const mood = input.mood ?? "Informative";
  const moodMap = MOOD_MAPPING[mood];
  const preset = input.presetId
    ? SHOW_PRESETS.find((p) => p.id === input.presetId)
    : undefined;

  const base: ShowConfig = {
    version: 1,
    topic: input.topic,
    durationMinutes: input.durationMinutes,
    mood,
    presetId: input.presetId,
    host: {
      name: "Paul",
      persona: "Professional, warm British community radio host",
      accent: "British English accent as heard in London, England",
      voice: "Puck",
      delivery: "measured",
    },
    guests: {
      mode: "auto",
      count: getDefaultGuestCount(moodMap.suggestedStyle),
    },
    structure: {
      style: moodMap.suggestedStyle,
      segments: DEFAULT_SEGMENTS,
    },
    features: { ...DEFAULT_FEATURES },
    music: {
      mood: moodMap.musicMood,
      enabled: true,
    },
    toneContext: moodMap.toneContext,
  };

  const merged = preset
    ? deepMergeShowConfig(base, preset.partial as Partial<ShowConfig>)
    : base;

  if (input.overrides) {
    return showConfigSchema.parse(deepMergeShowConfig(merged, sanitizeOverrides(input.overrides)));
  }

  if (!preset) {
    merged.structure.style = moodMap.suggestedStyle;
    merged.music.mood = moodMap.musicMood;
    merged.toneContext = moodMap.toneContext;
  }

  if (merged.guests.count) {
    merged.guests.count = clampGuestCount(merged.structure.style, merged.guests.count);
  }

  if (merged.structure.segments.length === 0) {
    merged.structure.segments = DEFAULT_SEGMENTS;
  }

  if (!merged.features || Object.keys(merged.features).length === 0) {
    merged.features = { ...DEFAULT_FEATURES };
  }

  return showConfigSchema.parse(merged);
}

function sanitizeOverrides(partial: Partial<ShowConfig>): Partial<ShowConfig> {
  const clean: Partial<ShowConfig> = { ...partial };
  if (clean.host) {
    const host = { ...clean.host };
    if (!host.name?.trim()) delete host.name;
    if (!host.persona?.trim()) delete host.persona;
    if (!host.accent?.trim()) delete host.accent;
    if (!host.voice) delete host.voice;
    if (!host.delivery) delete host.delivery;
    clean.host = Object.keys(host).length > 0 ? host : undefined;
  }
  if (clean.structure) {
    const structure = { ...clean.structure };
    if (!structure.style || !SHOW_STYLES.includes(structure.style)) {
      delete structure.style;
    }
    if (!structure.segments?.length) {
      delete structure.segments;
    }
    clean.structure = Object.keys(structure).length > 0 ? structure : undefined;
  }
  if (clean.guests) {
    const guests = { ...clean.guests };
    if (!guests.mode) delete guests.mode;
    if (!guests.count) delete guests.count;
    clean.guests = Object.keys(guests).length > 0 ? guests : undefined;
  }
  if (clean.music && !clean.music.mood) {
    if (clean.music.enabled === undefined) {
      delete clean.music;
    } else {
      delete clean.music.mood;
    }
  }
  return clean;
}

function deepMergeShowConfig(base: ShowConfig, partial: Partial<ShowConfig>): ShowConfig {
  return {
    ...base,
    ...partial,
    host: { ...base.host, ...partial.host },
    guests: { ...base.guests, ...partial.guests },
    structure: {
      style: partial.structure?.style ?? base.structure.style,
      segments:
        partial.structure?.segments && partial.structure.segments.length > 0
          ? partial.structure.segments
          : base.structure.segments,
    },
    features: { ...base.features, ...partial.features },
    music: { ...base.music, ...partial.music },
  };
}

export function parseShowConfigRequest(body: unknown): ShowConfig {
  const raw = body as Record<string, unknown>;

  if (raw.showConfig && typeof raw.showConfig === "object") {
    return showConfigSchema.parse(raw.showConfig);
  }

  const topic = typeof raw.topic === "string" ? raw.topic : "";
  const durationRaw = Number(raw.duration ?? 3);
  const durationMinutes = ([3, 5, 10, 15] as const).includes(durationRaw as 3 | 5 | 10 | 15)
    ? (durationRaw as 3 | 5 | 10 | 15)
    : 3;
  const mood = UI_MOODS.includes(raw.mood as UiMood) ? (raw.mood as UiMood) : "Informative";
  const presetId = typeof raw.presetId === "string" ? raw.presetId : undefined;
  const overrides =
    raw.overrides && typeof raw.overrides === "object"
      ? (raw.overrides as Partial<ShowConfig>)
      : undefined;

  if (!topic.trim()) {
    throw new z.ZodError([
      {
        code: "custom",
        message: "topic is required",
        path: ["topic"],
      },
    ]);
  }

  return buildShowConfig({ topic, durationMinutes, mood, presetId, overrides });
}

export function getEnabledFeatures(features: RadioFeatures): RadioFeatureKey[] {
  return RADIO_FEATURE_KEYS.filter((key) => {
    if (key === "signOffCatchphrase") return features.signOffCatchphrase;
    if (key === "backgroundMusic") return features.backgroundMusic;
    return Boolean(features[key as keyof RadioFeatures]);
  });
}

export const VOICE_LABELS: Record<GeminiVoice, string> = {
  Puck: "Warm male (studio host)",
  Kore: "Crisp female",
  Charon: "Deep male",
  Fenrir: "Energetic male",
};

export const ADVANCED_SETTINGS_KEY = "ai-radio-advanced-settings";

export function loadAdvancedSettings(): Partial<ShowConfig> | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(ADVANCED_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ShowConfig>;
    return parsed;
  } catch {
    return null;
  }
}

export function saveAdvancedSettings(settings: Partial<ShowConfig>): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(ADVANCED_SETTINGS_KEY, JSON.stringify(settings));
}
