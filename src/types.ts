export interface RawTranscriptLine {
  timecode: string; // "MM:SS"
  speaker: string;
  text: string;
}

export interface SpeakerInfo {
  name: string;
  role: "host" | "guest" | "co-host" | "reporter";
  voice?: string;
  accent?: string;
  delivery?: string;
  audioTreatment?: string;
}

export interface GuestProfileSummary {
  name?: string;
  persona?: string;
  accent?: string;
  delivery?: string;
  location?: string;
  gender?: string;
  voice?: string;
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
}

export interface TranscriptLine {
  start: number;
  end: number;
  text: string;
  speaker: string;
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
  speakers?: SpeakerInfo[];
  generationConfig?: GenerationConfigSummary;
  featuresEnabled?: string[];
  qualityReport?: QualityReportSummary;
}
