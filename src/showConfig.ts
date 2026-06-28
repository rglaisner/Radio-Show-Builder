import { z } from "zod";

export const TOPIC_MAX_LENGTH = 10_000;

export const GEMINI_VOICES = ["Puck", "Kore", "Charon", "Fenrir"] as const;
export type GeminiVoice = (typeof GEMINI_VOICES)[number];

export const SHOW_STYLES = ["debate", "roundtable", "interview", "explainer"] as const;
export type ShowStyle = (typeof SHOW_STYLES)[number];

export const STRUCTURE_STYLE_VALUES = [...SHOW_STYLES, "custom"] as const;
export type StructureStyle = (typeof STRUCTURE_STYLE_VALUES)[number];

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

export const GUEST_SPEAKING_STYLE_VALUES = [
  "auto",
  "warm-measured",
  "warm-energetic",
  "clear-conversational",
  "unhurried",
  "high-energy",
  "soft-spoken",
  "assertive",
  "custom",
] as const;
export type GuestSpeakingStyle = (typeof GUEST_SPEAKING_STYLE_VALUES)[number];

export type GuestVoiceHint =
  | "warm"
  | "clear"
  | "lowRegister"
  | "bold"
  | "soft"
  | "authoritative";

const SPEAKING_STYLE_RESOLUTION: Record<
  Exclude<GuestSpeakingStyle, "auto" | "custom">,
  { delivery: HostDelivery; voiceHint: GuestVoiceHint }
> = {
  "warm-measured": { delivery: "measured", voiceHint: "warm" },
  "warm-energetic": { delivery: "energetic", voiceHint: "warm" },
  "clear-conversational": { delivery: "measured", voiceHint: "clear" },
  unhurried: { delivery: "late-night", voiceHint: "lowRegister" },
  "high-energy": { delivery: "hype", voiceHint: "bold" },
  "soft-spoken": { delivery: "measured", voiceHint: "soft" },
  assertive: { delivery: "energetic", voiceHint: "authoritative" },
};

const VOICE_HINT_PREFERENCES: Record<
  GuestVoiceHint,
  { female: GeminiVoice; male: GeminiVoice }
> = {
  warm: { female: "Kore", male: "Puck" },
  clear: { female: "Kore", male: "Puck" },
  lowRegister: { female: "Kore", male: "Charon" },
  bold: { female: "Kore", male: "Fenrir" },
  soft: { female: "Kore", male: "Puck" },
  authoritative: { female: "Kore", male: "Charon" },
};

const DELIVERY_TO_SPEAKING_STYLE: Partial<Record<HostDelivery, GuestSpeakingStyle>> = {
  measured: "warm-measured",
  energetic: "warm-energetic",
  "late-night": "unhurried",
  hype: "high-energy",
};

const VOICE_TO_STYLE_DESCRIPTION: Record<GeminiVoice, string> = {
  Puck: "Warm studio delivery",
  Kore: "Crisp, clear delivery",
  Charon: "Low-register, resonant delivery",
  Fenrir: "Energetic, upbeat delivery",
};

export interface ResolvedGuestSpeakingStyle {
  delivery?: HostDelivery;
  voiceHint?: GuestVoiceHint;
  customText?: string;
}

export const GUEST_SPEAKING_STYLE_LABELS: Record<GuestSpeakingStyle, string> = {
  auto: "Auto-assign",
  "warm-measured": "Warm & measured",
  "warm-energetic": "Warm & energetic",
  "clear-conversational": "Clear & conversational",
  unhurried: "Unhurried & relaxed",
  "high-energy": "High-energy & upbeat",
  "soft-spoken": "Soft-spoken & thoughtful",
  assertive: "Assertive & direct",
  custom: "Custom…",
};

export function resolveGuestSpeakingStyle(guest: GuestProfile): ResolvedGuestSpeakingStyle {
  const style = guest.speakingStyle ?? "auto";
  if (style === "auto") {
    return {};
  }
  if (style === "custom") {
    const customText = guest.speakingStyleCustom?.trim();
    return customText ? { customText } : {};
  }
  const resolved = SPEAKING_STYLE_RESOLUTION[style];
  return { delivery: resolved.delivery, voiceHint: resolved.voiceHint };
}

export function getGuestSpeakingStyleLabel(guest: GuestProfile): string | undefined {
  const style = guest.speakingStyle ?? "auto";
  if (style === "auto") {
    return undefined;
  }
  if (style === "custom") {
    return guest.speakingStyleCustom?.trim() || "Custom";
  }
  return GUEST_SPEAKING_STYLE_LABELS[style];
}

interface LegacyGuestProfileInput {
  name?: string;
  persona?: string;
  accent?: string;
  location?: string;
  gender?: GuestGender;
  audioTreatment?: AudioTreatment;
  speakingStyle?: GuestSpeakingStyle;
  speakingStyleCustom?: string;
  voice?: GeminiVoice;
  delivery?: HostDelivery;
}

export function migrateGuestProfile(profile: LegacyGuestProfileInput): GuestProfile {
  const {
    voice: legacyVoice,
    delivery: legacyDelivery,
    speakingStyle: existingStyle,
    speakingStyleCustom: existingCustom,
    ...rest
  } = profile;

  if (existingStyle) {
    return {
      ...rest,
      gender: rest.gender ?? "unspecified",
      audioTreatment: rest.audioTreatment ?? "phone",
      speakingStyle: existingStyle,
      ...(existingStyle === "custom" && existingCustom?.trim()
        ? { speakingStyleCustom: existingCustom.trim() }
        : {}),
    };
  }

  let speakingStyle: GuestSpeakingStyle = "auto";
  let speakingStyleCustom: string | undefined;

  if (legacyVoice && legacyDelivery) {
    const mapped = DELIVERY_TO_SPEAKING_STYLE[legacyDelivery];
    if (mapped && legacyVoice === VOICE_HINT_PREFERENCES[SPEAKING_STYLE_RESOLUTION[mapped].voiceHint].male) {
      speakingStyle = mapped;
    } else if (mapped && legacyDelivery === "energetic" && legacyVoice === "Charon") {
      speakingStyle = "assertive";
    } else {
      speakingStyle = "custom";
      speakingStyleCustom = `${VOICE_TO_STYLE_DESCRIPTION[legacyVoice]}, ${legacyDelivery} delivery`;
    }
  } else if (legacyDelivery) {
    speakingStyle = DELIVERY_TO_SPEAKING_STYLE[legacyDelivery] ?? "custom";
    if (speakingStyle === "custom") {
      speakingStyleCustom = `${legacyDelivery} delivery`;
    }
  } else if (legacyVoice) {
    speakingStyle = "custom";
    speakingStyleCustom = VOICE_TO_STYLE_DESCRIPTION[legacyVoice];
  }

  return {
    ...rest,
    gender: rest.gender ?? "unspecified",
    audioTreatment: rest.audioTreatment ?? "phone",
    speakingStyle,
    ...(speakingStyle === "custom" && speakingStyleCustom
      ? { speakingStyleCustom }
      : {}),
  };
}

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

export const REALISM_INTENSITY_VALUES = ["subtle", "moderate", "lively"] as const;
export type RealismIntensity = (typeof REALISM_INTENSITY_VALUES)[number];

export interface RealismSettings {
  enabled: boolean;
  intensity: RealismIntensity;
  allowGuestOverlap: boolean;
  ambientBeds: boolean;
}

export interface GuestProfile {
  name?: string;
  persona?: string;
  accent?: string;
  location?: string;
  gender: GuestGender;
  audioTreatment: AudioTreatment;
  speakingStyle: GuestSpeakingStyle;
  speakingStyleCustom?: string;
}

const guestProfileInputSchema = z.object({
  name: z.string().optional(),
  persona: z.string().optional(),
  accent: z.string().max(200).optional(),
  location: z.string().optional(),
  gender: z.enum(GUEST_GENDERS).default("unspecified"),
  audioTreatment: z.enum(AUDIO_TREATMENTS).default("phone"),
  speakingStyle: z.enum(GUEST_SPEAKING_STYLE_VALUES).optional(),
  speakingStyleCustom: z.string().max(200).optional(),
  voice: z.enum(GEMINI_VOICES).optional(),
  delivery: z.enum(HOST_DELIVERIES).optional(),
});

const guestProfileSchema = guestProfileInputSchema.transform(
  (profile): GuestProfile => migrateGuestProfile(profile)
);

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

const realismSchema = z.object({
  enabled: z.boolean().default(true),
  intensity: z.enum(REALISM_INTENSITY_VALUES).default("moderate"),
  allowGuestOverlap: z.boolean().default(true),
  ambientBeds: z.boolean().default(true),
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
      style: z.enum(STRUCTURE_STYLE_VALUES).default("debate"),
      styleNotes: z.string().max(200).optional(),
      segments: z.array(segmentConfigSchema).default([]),
    }),
    features: radioFeaturesSchema,
    realism: realismSchema.default({
      enabled: true,
      intensity: "moderate",
      allowGuestOverlap: true,
      ambientBeds: true,
    }),
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
    if (config.guests.mode === "fixed" && config.guests.roster) {
      for (let i = 0; i < config.guests.roster.length; i++) {
        const name = config.guests.roster[i]?.name?.trim();
        if (!name) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Fixed guest mode requires a name for every guest",
            path: ["guests", "roster", i, "name"],
          });
        }
      }
    }
    if (
      config.guests.mode === "guided" &&
      config.guests.count &&
      config.guests.roster &&
      config.guests.roster.length > config.guests.count
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Guest roster cannot exceed guest count in guided mode",
        path: ["guests", "roster"],
      });
    }
    if (config.structure.style === "custom" && !config.structure.styleNotes?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Custom show style requires a description",
        path: ["structure", "styleNotes"],
      });
    }
  });

export type SegmentConfig = z.infer<typeof segmentConfigSchema>;
export type RadioFeatures = z.infer<typeof radioFeaturesSchema>;
export type ShowConfig = z.infer<typeof showConfigSchema>;

export interface ShowPreset {
  id: string;
  name: string;
  description: string;
  partial: Partial<ShowConfig>;
}

export type StarterCategory = "tech" | "culture" | "news" | "format";

export interface ShowStarter {
  id: string;
  kind: "example" | "format";
  category: StarterCategory;
  title: string;
  description: string;
  presetId: string;
  prompt?: string;
  durationMinutes?: 3 | 5 | 10 | 15;
  mood?: UiMood;
}

export const STARTER_CATEGORIES: { id: StarterCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "tech", label: "Tech & AI" },
  { id: "culture", label: "Arts & Life" },
  { id: "news", label: "News & Sports" },
  { id: "format", label: "Formats" },
];

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

export const DEFAULT_REALISM: RealismSettings = {
  enabled: true,
  intensity: "moderate",
  allowGuestOverlap: true,
  ambientBeds: true,
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
      realism: {
        enabled: true,
        intensity: "lively",
        allowGuestOverlap: true,
        ambientBeds: true,
      },
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
      realism: {
        enabled: true,
        intensity: "moderate",
        allowGuestOverlap: true,
        ambientBeds: true,
      },
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
      guests: {
        mode: "guided",
        count: 1,
        roster: [
          {
            persona: "Subject-matter expert with deep knowledge and thoughtful answers",
            speakingStyle: "clear-conversational",
            audioTreatment: "studio",
            gender: "unspecified",
          },
        ],
      },
      features: DEFAULT_FEATURES,
      music: { mood: "chill", enabled: true },
      realism: {
        enabled: true,
        intensity: "subtle",
        allowGuestOverlap: false,
        ambientBeds: true,
      },
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
      guests: {
        mode: "guided",
        count: 4,
        roster: [
          {
            persona: "Passionate caller with a strong opinion",
            speakingStyle: "high-energy",
            audioTreatment: "phone",
            gender: "male",
          },
          {
            persona: "Skeptical caller who challenges the host",
            speakingStyle: "assertive",
            audioTreatment: "phone",
            gender: "female",
          },
          {
            persona: "Curious first-time caller asking basic questions",
            speakingStyle: "warm-measured",
            audioTreatment: "phone",
            gender: "unspecified",
          },
          {
            persona: "Regular listener with insider knowledge",
            speakingStyle: "warm-energetic",
            audioTreatment: "phone",
            gender: "male",
          },
        ],
      },
      features: {
        ...DEFAULT_FEATURES,
        phoneConnectSfx: true,
        listenerMail: true,
      },
      music: { mood: "debate", enabled: true },
      mood: "Hype & Energetic",
      realism: {
        enabled: true,
        intensity: "lively",
        allowGuestOverlap: true,
        ambientBeds: true,
      },
    },
  },
];

export const SHOW_STARTERS: ShowStarter[] = [
  {
    id: "daily-hacker-bites",
    kind: "example",
    category: "tech",
    title: "Daily Hacker Bites",
    description: "Voice a digest of the top stories currently on Hacker News",
    presetId: "explainer-hour",
    prompt: "Generate a radio show called Daily Hacker Bites based on top Hacker News stories.",
    durationMinutes: 3,
    mood: "Informative",
  },
  {
    id: "github-roundtable",
    kind: "example",
    category: "tech",
    title: "GitHub Roundtable",
    description: "Review the AlphaFold 3 repository and Google DeepMind's biology model",
    presetId: "roundtable-chill",
    prompt:
      "Generate a radio show with a roundtable concept, educating listeners about https://github.com/google-deepmind/alphafold3.",
    durationMinutes: 3,
    mood: "Conversational",
  },
  {
    id: "philosophy-cafe",
    kind: "example",
    category: "culture",
    title: "Philosophy Café",
    description: "Host an atmospheric debate analyzing existentialism and humanity's future",
    presetId: "roundtable-chill",
    prompt: "Generate a thought-provoking discussion in a cozy café setting discussing existential questions.",
    durationMinutes: 3,
    mood: "Conversational",
  },
  {
    id: "cinematic-reviews",
    kind: "example",
    category: "culture",
    title: "Cinematic Reviews",
    description: "Break down the visual style & legacy of iconic film directors",
    presetId: "deep-interview",
    prompt: "Generate a talk radio segment analyzing the distinct visual styles of movie directors.",
    durationMinutes: 3,
    mood: "Late Night Chill",
  },
  {
    id: "sports-tournament-debate",
    kind: "example",
    category: "news",
    title: "Sports Tournament Debate",
    description: "Lively debate about preparations and predictions for a major tournament",
    presetId: "tech-debate",
    prompt: "Generate a lively sports debate about preparations for a major upcoming tournament.",
    durationMinutes: 3,
    mood: "Hype & Energetic",
  },
  {
    id: "fintech-briefing",
    kind: "example",
    category: "news",
    title: "Fintech Briefing",
    description: "Explain decentralized finance developments and global stock market trends",
    presetId: "explainer-hour",
    prompt: "Generate a radio segment providing an interactive briefing on fintech and global markets.",
    durationMinutes: 3,
    mood: "Informative",
  },
  ...SHOW_PRESETS.map((preset) => ({
    id: `format-${preset.id}`,
    kind: "format" as const,
    category: "format" as const,
    title: preset.name,
    description: preset.description,
    presetId: preset.id,
    mood: preset.partial.mood,
  })),
];

const STYLE_GUEST_LIMITS: Record<ShowStyle, { min: number; max: number }> = {
  debate: { min: 2, max: 6 },
  roundtable: { min: 3, max: 6 },
  interview: { min: 1, max: 3 },
  explainer: { min: 2, max: 4 },
};

export function resolveGuestLimitStyle(style: StructureStyle | undefined): ShowStyle {
  if (!style || style === "custom" || !SHOW_STYLES.includes(style)) {
    return "roundtable";
  }
  return style;
}

export function getGuestLimits(style: ShowStyle | StructureStyle): { min: number; max: number } {
  return STYLE_GUEST_LIMITS[resolveGuestLimitStyle(style)];
}

export function createEmptyGuestProfile(): GuestProfile {
  return {
    gender: "unspecified",
    audioTreatment: "phone",
    speakingStyle: "auto",
  };
}

const DEFAULT_GUEST_ROSTERS: Record<string, GuestProfile[]> = {
  "deep-interview": [
    {
      persona: "Subject-matter expert with deep knowledge and thoughtful answers",
      speakingStyle: "clear-conversational",
      audioTreatment: "studio",
      gender: "unspecified",
    },
  ],
  "call-in-hotline": [
    {
      persona: "Passionate caller with a strong opinion",
      speakingStyle: "high-energy",
      audioTreatment: "phone",
      gender: "male",
    },
    {
      persona: "Skeptical caller who challenges the host",
      speakingStyle: "assertive",
      audioTreatment: "phone",
      gender: "female",
    },
    {
      persona: "Curious first-time caller asking basic questions",
      speakingStyle: "warm-measured",
      audioTreatment: "phone",
      gender: "unspecified",
    },
    {
      persona: "Regular listener with insider knowledge",
      speakingStyle: "warm-energetic",
      audioTreatment: "phone",
      gender: "male",
    },
  ],
};

export function buildDefaultGuestRoster(
  presetId: string,
  style: ShowStyle,
  count: number
): GuestProfile[] {
  const presetRoster = DEFAULT_GUEST_ROSTERS[presetId];
  if (presetRoster) {
    const roster = presetRoster.slice(0, count);
    while (roster.length < count) {
      roster.push(createEmptyGuestProfile());
    }
    return roster;
  }

  const styleFallbacks: Record<ShowStyle, string[]> = {
    debate: [
      "Advocate arguing passionately for one side",
      "Skeptic pushing back with counterpoints",
    ],
    roundtable: [
      "Panelist offering a creative perspective",
      "Panelist with a pragmatic, grounded view",
      "Panelist who asks clarifying questions",
      "Panelist who connects ideas across domains",
    ],
    interview: ["Guest expert with deep subject knowledge"],
    explainer: [
      "Co-host who breaks down complex ideas simply",
      "Co-host who adds real-world examples",
      "Co-host who summarizes key takeaways",
    ],
  };

  const personas = styleFallbacks[style];
  const roster: GuestProfile[] = [];
  for (let i = 0; i < count; i++) {
    roster.push({
      persona: personas[i % personas.length],
      speakingStyle: "auto",
      audioTreatment: style === "interview" ? "studio" : "phone",
      gender: "unspecified",
    });
  }
  return roster;
}

export function applyStarterToOverrides(starterId: string, fallbackMood: UiMood): Partial<ShowConfig> {
  const starter = SHOW_STARTERS.find((s) => s.id === starterId);
  if (!starter) {
    throw new Error(`Unknown starter: ${starterId}`);
  }

  const preset = SHOW_PRESETS.find((p) => p.id === starter.presetId);
  if (!preset) {
    throw new Error(`Unknown preset: ${starter.presetId}`);
  }

  const effectiveMood = starter.mood ?? preset.partial.mood ?? fallbackMood;
  const style =
    (preset.partial.structure?.style as ShowStyle | undefined) ??
    MOOD_MAPPING[effectiveMood].suggestedStyle;

  const overrides: Partial<ShowConfig> = {
    ...preset.partial,
    presetId: preset.id,
    mood: effectiveMood,
    structure: {
      style,
      segments: preset.partial.structure?.segments ?? DEFAULT_SEGMENTS,
    },
  };

  const guestMode = overrides.guests?.mode ?? "auto";
  const guestCount = overrides.guests?.count ?? getDefaultGuestCount(style);

  if (guestMode === "guided" || guestMode === "fixed") {
    const roster =
      overrides.guests?.roster ?? buildDefaultGuestRoster(preset.id, style, guestCount);
    overrides.guests = syncGuestRosterForMode(
      { mode: guestMode, count: guestCount, roster },
      style
    ) as ShowConfig["guests"];
  } else {
    overrides.guests = syncGuestRosterForMode(
      { mode: "auto", count: guestCount },
      style
    ) as ShowConfig["guests"];
  }

  return overrides;
}

export function getStarterById(starterId: string): ShowStarter | undefined {
  return SHOW_STARTERS.find((s) => s.id === starterId);
}

export function syncGuestRosterForMode(
  guests: Partial<ShowConfig["guests"]>,
  style: ShowStyle
): Partial<ShowConfig["guests"]> {
  const mode = guests.mode ?? "auto";
  const limits = getGuestLimits(style);
  const defaultCount = clampGuestCount(style, guests.count ?? getDefaultGuestCount(style));

  if (mode === "auto") {
    return {
      mode: "auto",
      count: guests.count !== undefined ? clampGuestCount(style, guests.count) : defaultCount,
    };
  }

  if (mode === "guided") {
    const count = clampGuestCount(style, guests.count ?? defaultCount);
    let roster = guests.roster ? [...guests.roster] : [];
    while (roster.length < count) {
      roster.push(createEmptyGuestProfile());
    }
    if (roster.length > count) {
      roster = roster.slice(0, count);
    }
    return { mode: "guided", count, roster };
  }

  // fixed
  let roster = guests.roster?.length ? [...guests.roster] : [createEmptyGuestProfile()];
  roster = roster.slice(0, limits.max);
  return { mode: "fixed", count: roster.length, roster };
}

const FEMALE_VOICES: GeminiVoice[] = ["Kore"];
const MALE_VOICES: GeminiVoice[] = ["Puck", "Charon", "Fenrir"];

export function pickGuestVoice(
  guest: GuestProfile,
  usedVoices: Set<GeminiVoice>,
  maleIndex: number,
  femaleIndex: number
): { voice: GeminiVoice; maleIndex: number; femaleIndex: number } {
  const resolved = resolveGuestSpeakingStyle(guest);
  const gender = guest.gender ?? "unspecified";

  const preferred =
    resolved.voiceHint !== undefined
      ? gender === "female"
        ? VOICE_HINT_PREFERENCES[resolved.voiceHint].female
        : VOICE_HINT_PREFERENCES[resolved.voiceHint].male
      : undefined;

  if (gender === "female") {
    const pool = FEMALE_VOICES;
    const voice =
      preferred && pool.includes(preferred) && !usedVoices.has(preferred)
        ? preferred
        : pool[femaleIndex % pool.length];
    return { voice, maleIndex, femaleIndex: femaleIndex + 1 };
  }

  const malePool = MALE_VOICES.filter((v) => !usedVoices.has(v));
  const voice =
    preferred && malePool.includes(preferred)
      ? preferred
      : (malePool[maleIndex % malePool.length] ??
        MALE_VOICES[maleIndex % MALE_VOICES.length]);
  return { voice, maleIndex: maleIndex + 1, femaleIndex };
}

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
    realism: { ...DEFAULT_REALISM },
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
    const withOverrides = deepMergeShowConfig(merged, sanitizeOverrides(input.overrides));
    if (withOverrides.guests.roster?.length) {
      withOverrides.guests.roster = withOverrides.guests.roster.map((guest) =>
        guestProfileSchema.parse(guest)
      );
    }
    return showConfigSchema.parse(withOverrides);
  }

  if (!preset) {
    merged.structure.style = moodMap.suggestedStyle;
    merged.music.mood = moodMap.musicMood;
    merged.toneContext = moodMap.toneContext;
  }

  if (merged.guests.count) {
    merged.guests.count = clampGuestCount(
      resolveGuestLimitStyle(merged.structure.style),
      merged.guests.count
    );
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
    const isKnownStyle =
      structure.style &&
      (SHOW_STYLES.includes(structure.style as ShowStyle) || structure.style === "custom");
    if (!isKnownStyle) {
      delete structure.style;
    }
    if (structure.style !== "custom" || !structure.styleNotes?.trim()) {
      delete structure.styleNotes;
    }
    if (!structure.segments?.length) {
      delete structure.segments;
    }
    clean.structure = Object.keys(structure).length > 0 ? structure : undefined;
  }
  if (clean.guests) {
    const guests = { ...clean.guests };
    if (!guests.mode) delete guests.mode;
    if (guests.count === undefined) delete guests.count;
    if (!guests.roster?.length) delete guests.roster;
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
  const mergedGuests = { ...base.guests, ...partial.guests };
  if (partial.guests?.roster !== undefined) {
    mergedGuests.roster = partial.guests.roster;
  }

  return {
    ...base,
    ...partial,
    host: { ...base.host, ...partial.host },
    guests: mergedGuests,
    structure: {
      style: partial.structure?.style ?? base.structure.style,
      styleNotes: partial.structure?.styleNotes ?? base.structure.styleNotes,
      segments:
        partial.structure?.segments && partial.structure.segments.length > 0
          ? partial.structure.segments
          : base.structure.segments,
    },
    features: { ...base.features, ...partial.features },
    realism: { ...base.realism, ...partial.realism },
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

export const AUDIO_TREATMENT_LABELS: Record<AudioTreatment, string> = {
  phone: "Phone call (default)",
  studio: "Studio quality",
  field: "Field reporter",
};

export const GUEST_GENDER_LABELS: Record<GuestGender, string> = {
  male: "Male",
  female: "Female",
  unspecified: "Unspecified",
};

export function formatShowConfigError(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return "Invalid show configuration";
  const path = first.path.length > 0 ? `${first.path.join(".")}: ` : "";
  return `${path}${first.message}`;
}

export const ADVANCED_SETTINGS_KEY = "ai-radio-advanced-settings";
export const QUICKSTART_DISMISSED_KEY = "ai-radio-quickstart-dismissed";

export function loadAdvancedSettings(): Partial<ShowConfig> | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(ADVANCED_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ShowConfig>;
    if (parsed.guests?.roster?.length) {
      parsed.guests = {
        ...parsed.guests,
        roster: parsed.guests.roster.map((guest) => guestProfileSchema.parse(guest)),
      };
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveAdvancedSettings(settings: Partial<ShowConfig>): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(ADVANCED_SETTINGS_KEY, JSON.stringify(settings));
}
