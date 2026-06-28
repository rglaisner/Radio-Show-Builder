import type { ShowConfig } from "../../src/showConfig.ts";

export type PolicyIncidentStatus =
  | "detected"
  | "reviewing"
  | "awaiting_user"
  | "applied"
  | "cancelled";

export type PolicyCauseSource =
  | "script_line"
  | "tts_text"
  | "topic"
  | "tone_context"
  | "sponsor_read"
  | "image_prompt"
  | "metadata_prompt";

export type PolicyCausingInputSource =
  | "script"
  | "tts_prompt"
  | "show_config"
  | "metadata_prompt"
  | "image_prompt";

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

export interface PolicyRemediationPlan {
  actions: PolicyRemediationAction[];
  appliedAt?: string;
}

export interface PolicyCausingInput {
  source: PolicyCausingInputSource;
  file?: string;
  eventId?: string;
  excerpt: string;
}

export interface PolicyIncident {
  id: string;
  generationId: string;
  detectedAt: string;
  stepIndex: number;
  stepLabel: string;
  providerMessage: string;
  rawLogExcerpt: string;
  causingInput?: PolicyCausingInput;
  environmentId?: string;
  failedEventIds?: string[];
  review?: PolicyReviewResult;
  remediation?: PolicyRemediationPlan;
  status: PolicyIncidentStatus;
  showConfig: ShowConfig;
}

export interface PolicyDetection {
  providerMessage: string;
  rawLogExcerpt: string;
  eventId?: string;
  speaker?: string;
  blockedText?: string;
  scriptName?: string;
  structured?: {
    eventId?: string;
    speaker?: string;
    text?: string;
    providerMessage?: string;
  };
}

export interface PolicyPausePayload {
  incidentId: string;
  generationId: string;
  stepIndex: number;
  stepLabel: string;
  providerMessage: string;
  status: PolicyIncidentStatus;
  causingInput?: PolicyCausingInput;
  recoverable?: boolean;
}
