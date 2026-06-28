import { PIPELINE_STEPS } from "../../src/pipelineSteps.ts";
import type { PolicyDetection } from "./policyTypes.ts";

const POLICY_ERROR_PREFIX = "POLICY_ERROR:";

const POLICY_PATTERNS = [
  /input blocked/i,
  /prohibited use/i,
  /prohibited use policy/i,
  /content policy/i,
  /violates google/i,
  /sensitive words/i,
  /safety filter/i,
  /blocked due to/i,
];

const QUOTA_PATTERNS = [
  /quota/i,
  /resource_exhausted/i,
  /too_many_requests/i,
  /spend cap/i,
  /rate limit/i,
];

const SCRIPT_MATCHERS = [
  "generate_script.py",
  "script_review.py",
  "generate_tts.py",
  "generate_metadata.py",
  "generate_image.py",
  "generate_music.py",
];

export function isQuotaError(text: string, statusCode?: number): boolean {
  if (statusCode === 429) return true;
  const lower = text.toLowerCase();
  return QUOTA_PATTERNS.some((pattern) => pattern.test(lower));
}

export function isPolicyError(text: string): boolean {
  if (!text.trim()) return false;
  if (isQuotaError(text)) return false;

  if (text.includes(POLICY_ERROR_PREFIX)) return true;

  const lower = text.toLowerCase();
  const hasPolicySignal = POLICY_PATTERNS.some((pattern) => pattern.test(lower));
  if (!hasPolicySignal) return false;

  // "invalid_request" alone is too broad — require policy context
  if (lower.includes("invalid_request") && !hasPolicySignal) return false;

  return true;
}

function parseStructuredPolicyError(text: string): PolicyDetection["structured"] | null {
  const lines = text.split("\n");
  for (const line of lines) {
    const idx = line.indexOf(POLICY_ERROR_PREFIX);
    if (idx === -1) continue;
    const jsonPart = line.slice(idx + POLICY_ERROR_PREFIX.length).trim();
    try {
      const parsed = JSON.parse(jsonPart) as Record<string, unknown>;
      return {
        eventId: typeof parsed.eventId === "string" ? parsed.eventId : undefined,
        speaker: typeof parsed.speaker === "string" ? parsed.speaker : undefined,
        text: typeof parsed.text === "string" ? parsed.text : undefined,
        providerMessage:
          typeof parsed.providerMessage === "string" ? parsed.providerMessage : undefined,
      };
    } catch {
      continue;
    }
  }
  return null;
}

function extractProviderMessage(text: string): string {
  const structured = parseStructuredPolicyError(text);
  if (structured?.providerMessage) return structured.providerMessage;

  const blockedMatch = text.match(/Input blocked:[^.]*(?:\.[^.]*)?/i);
  if (blockedMatch) return blockedMatch[0].trim();

  const messageMatch = text.match(/'message':\s*'([^']+)'/);
  if (messageMatch) return messageMatch[1];

  const jsonMessageMatch = text.match(/"message"\s*:\s*"([^"]+)"/);
  if (jsonMessageMatch) return jsonMessageMatch[1];

  for (const line of text.split("\n")) {
    if (isPolicyError(line)) return line.trim().slice(0, 500);
  }

  return text.trim().slice(0, 500);
}

function extractEventId(text: string, structured?: PolicyDetection["structured"]): string | undefined {
  if (structured?.eventId) return structured.eventId;
  const match = text.match(/\[([evt_][\w\d_]+)\]/);
  return match?.[1];
}

function detectScriptName(text: string): string | undefined {
  for (const script of SCRIPT_MATCHERS) {
    if (text.includes(script)) return script;
  }
  return undefined;
}

export function detectPolicyError(text: string): PolicyDetection | null {
  if (!isPolicyError(text)) return null;

  const structured = parseStructuredPolicyError(text);
  const providerMessage = extractProviderMessage(text);
  const eventId = extractEventId(text, structured ?? undefined);

  return {
    providerMessage,
    rawLogExcerpt: text.slice(0, 2000),
    eventId,
    speaker: structured?.speaker,
    blockedText: structured?.text,
    scriptName: detectScriptName(text),
    structured: structured ?? undefined,
  };
}

/** Steps where a policy failure blocks all downstream work (not TTS partial). */
export function isBlockingPolicyStep(stepIndex: number): boolean {
  // TTS (5) may have partial parallel failures; other LLM steps are blocking
  return stepIndex !== 5;
}

export function stepIndexFromScriptName(scriptName: string | undefined): number {
  if (!scriptName) return 0;
  const step = PIPELINE_STEPS.find((s) =>
    s.matchers.some((matcher) => scriptName.includes(matcher.replace(".py", "")))
  );
  return step?.index ?? 0;
}

export function stepLabelFromIndex(stepIndex: number): string {
  return PIPELINE_STEPS.find((s) => s.index === stepIndex)?.label ?? `Step ${stepIndex}`;
}
