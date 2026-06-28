import { API_BASE_URL } from "./agentClient.ts";
import { buildPolicyReviewPrompt } from "./policyRemediationPrompt.ts";
import type { PolicyIncident, PolicyReviewResult } from "./policyTypes.ts";
import type { ShowConfig } from "../../src/showConfig.ts";

const REVIEW_MODEL = "gemini-2.0-flash";

function parseReviewJson(text: string): PolicyReviewResult | null {
  const trimmed = text.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) return null;

  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;
    const causes = Array.isArray(parsed.causes) ? parsed.causes : [];
    const actions = Array.isArray(parsed.actions) ? parsed.actions : [];

    return {
      recoverable: parsed.recoverable !== false,
      summary: typeof parsed.summary === "string" ? parsed.summary : "Content policy issue detected.",
      causes: causes.map((cause, index) => {
        const c = cause as Record<string, unknown>;
        const location = (c.location as Record<string, unknown>) ?? {};
        return {
          id: typeof c.id === "string" ? c.id : `cause-${index + 1}`,
          confidence: c.confidence === "medium" ? "medium" : "high",
          source: (typeof c.source === "string" ? c.source : "tts_text") as PolicyReviewResult["causes"][0]["source"],
          location: {
            file: typeof location.file === "string" ? location.file : undefined,
            line: typeof location.line === "number" ? location.line : undefined,
            eventId: typeof location.eventId === "string" ? location.eventId : undefined,
          },
          excerpt: typeof c.excerpt === "string" ? c.excerpt : "",
          triggerPhrases: Array.isArray(c.triggerPhrases)
            ? c.triggerPhrases.filter((p): p is string => typeof p === "string")
            : [],
          explanation: typeof c.explanation === "string" ? c.explanation : "",
        };
      }),
      actions: actions.map((action, index) => {
        const a = action as Record<string, unknown>;
        const target = (a.target as Record<string, unknown>) ?? {};
        return {
          id: typeof a.id === "string" ? a.id : `action-${index + 1}`,
          type: (typeof a.type === "string" ? a.type : "replace_text") as PolicyReviewResult["actions"][0]["type"],
          target: {
            file: typeof target.file === "string" ? target.file : undefined,
            eventId: typeof target.eventId === "string" ? target.eventId : undefined,
            configPath: typeof target.configPath === "string" ? target.configPath : undefined,
          },
          original: typeof a.original === "string" ? a.original : "",
          proposed: typeof a.proposed === "string" ? a.proposed : "",
          rationale: typeof a.rationale === "string" ? a.rationale : "",
        };
      }),
    };
  } catch (error) {
    console.error("[policyReviewAgent] JSON parse failed:", error);
    return null;
  }
}

export async function runPolicyReviewAgent(
  incident: PolicyIncident,
  showConfig: ShowConfig,
  apiKey: string
): Promise<PolicyReviewResult> {
  const prompt = buildPolicyReviewPrompt(incident, showConfig);

  const response = await fetch(
    `${API_BASE_URL}/models/${REVIEW_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      }),
    }
  );

  if (!response.ok) {
    const errBody = await response.text();
    console.error(`[policyReviewAgent] API error ${response.status}: ${errBody}`);
    return buildFallbackReview(incident);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const parsed = parseReviewJson(text);
  if (parsed) return parsed;

  return buildFallbackReview(incident);
}

function buildFallbackReview(incident: PolicyIncident): PolicyReviewResult {
  const excerpt = incident.causingInput?.excerpt ?? incident.rawLogExcerpt.slice(0, 300);
  return {
    recoverable: true,
    summary: "A content policy block was detected. Review and edit the flagged text below.",
    causes: [
      {
        id: "cause-fallback",
        confidence: "medium",
        source: incident.causingInput?.source === "script" ? "script_line" : "tts_text",
        location: {
          file: incident.causingInput?.file,
          eventId: incident.causingInput?.eventId,
        },
        excerpt,
        triggerPhrases: [],
        explanation: incident.providerMessage,
      },
    ],
    actions: [
      {
        id: "action-fallback",
        type: "replace_text",
        target: {
          file: incident.causingInput?.file ?? "workspace/data/script.md",
          eventId: incident.causingInput?.eventId,
        },
        original: excerpt.slice(0, 200),
        proposed: "",
        rationale: "Rephrase this passage to remove policy-sensitive wording while keeping the show topic.",
      },
    ],
  };
}
