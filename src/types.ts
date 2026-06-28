export interface RawTranscriptLine {
  timecode: string; // "MM:SS"
  endTimecode?: string; // "MM:SS" — used for overlapping speech
  speaker: string;
  text: string;
  overlapGroup?: string;
}

export interface TranscriptLine {
  start: number;
  end: number;
  text: string;
  speaker: string;
  overlapGroup?: string;
}

export interface SpeakerInfo {
  name: string;
  role: "host" | "guest" | "co-host" | "reporter";
  voice?: string;
  accent?: string;
  delivery?: string;
  speakingStyle?: string;
  audioTreatment?: string;
}

export interface GuestProfileSummary {
  name?: string;
  persona?: string;
  accent?: string;
  speakingStyle?: string;
  speakingStyleCustom?: string;
  location?: string;
  gender?: string;
  audioTreatment?: string;
}

export interface QualityReportSummary {
  passed: boolean;
  duration_delta_pct?: number;
  warnings?: string[];
}

export interface GenerationConfigSummary {
  presetId?: string;
  style?: string;
  hostName?: string;
  guestMode?: string;
  guestCount?: number;
  guestProfiles?: GuestProfileSummary[];
  featuresEnabled?: string[];
}

export interface RawRadioShow {
  show_title: string;
  show_duration: string; // "MM:SS"
  two_sentence_summary: string;
  date_of_generation: string;
  timecoded_transcript: RawTranscriptLine[];
  coverImage?: string; // Added for UI
  audioUrl?: string;   // Added for playback
  notesUrl?: string;   // Added for downloading show notes
  speakers?: SpeakerInfo[];
  generation_config?: GenerationConfigSummary;
  features_enabled?: string[];
  quality_report?: QualityReportSummary;
  completeness?: SalvageCompleteness;
  lastCompletedStep?: number;
  canResume?: boolean;
  isPartial?: boolean;
}

export type SalvageCompleteness = "full" | "playable" | "partial";

export type CheckpointStatus =
  | "running"
  | "failed"
  | "salvaged"
  | "completed"
  | "paused_policy";

export type PolicyCauseSource =
  | "script_line"
  | "tts_text"
  | "topic"
  | "tone_context"
  | "sponsor_read"
  | "image_prompt"
  | "metadata_prompt";

export interface PolicyCause {
  id: string;
  confidence: "high" | "medium";
  source: PolicyCauseSource;
  location: { file?: string; line?: number; eventId?: string };
  excerpt: string;
  triggerPhrases: string[];
  explanation: string;
}

export interface PolicyRemediationAction {
  id: string;
  type:
    | "replace_text"
    | "update_config_field"
    | "skip_event"
    | "soften_sponsor_read";
  target: { file?: string; eventId?: string; configPath?: string };
  original: string;
  proposed: string;
  rationale: string;
}

export interface PolicyReviewResult {
  recoverable: boolean;
  summary: string;
  causes: PolicyCause[];
  actions: PolicyRemediationAction[];
}

export interface PolicyCausingInput {
  source: "script" | "tts_prompt" | "show_config" | "metadata_prompt" | "image_prompt";
  file?: string;
  eventId?: string;
  excerpt: string;
}

export interface PolicyIncidentState {
  incidentId: string;
  generationId: string;
  stepIndex: number;
  stepLabel: string;
  providerMessage: string;
  status: "detected" | "reviewing" | "awaiting_user" | "applied" | "cancelled";
  causingInput?: PolicyCausingInput;
  review?: PolicyReviewResult;
}

export interface GenerationCheckpoint {
  generationId: string;
  lastCompletedStep: number;
  canResume: boolean;
  completeness?: SalvageCompleteness;
  interactionId?: string;
  environmentId?: string;
  status: CheckpointStatus;
  policyIncidentId?: string;
}

export interface RadioShow {
  title: string;
  duration: number;
  summary: string;
  date: string;
  host: string;
  coverImage: string;
  audioUrl: string;
  notesUrl?: string;
  transcript: TranscriptLine[];
  shareId?: string;
  shareUrl?: string;
  isUserGenerated?: boolean;
  isPartial?: boolean;
  completeness?: SalvageCompleteness;
  lastCompletedStep?: number;
  canResume?: boolean;
  generationId?: string;
  speakers?: SpeakerInfo[];
  generationConfig?: GenerationConfigSummary;
  featuresEnabled?: string[];
  qualityReport?: QualityReportSummary;
}
