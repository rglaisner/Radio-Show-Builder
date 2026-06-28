import type { ShowConfig } from "../../src/showConfig.ts";
import type { PolicyCausingInput, PolicyIncident } from "./policyTypes.ts";

export function buildPolicyReviewPrompt(
  incident: PolicyIncident,
  showConfig: ShowConfig
): string {
  const causing = incident.causingInput;
  return `You are a content policy analyst for an AI radio show production pipeline.

A Google Gemini API call was blocked due to a content policy violation. Your job is to:
1. Pinpoint the exact phrase(s) in the causing input that most likely triggered the block
2. Propose minimal text edits that preserve the show's intent while complying with provider policy
3. Never suggest circumventing, evading, or bypassing safety filters

## Provider error
${incident.providerMessage}

## Pipeline step
${incident.stepLabel} (step ${incident.stepIndex})

## Show configuration summary
- Topic: ${showConfig.topic.slice(0, 800)}
- Tone context: ${showConfig.toneContext || "(none)"}
- Mock sponsor read enabled: ${showConfig.features.mockSponsorRead}
- Host: ${showConfig.host.name}

## Causing input
Source: ${causing?.source ?? "unknown"}
File: ${causing?.file ?? "unknown"}
Event ID: ${causing?.eventId ?? "none"}

\`\`\`
${causing?.excerpt ?? incident.rawLogExcerpt.slice(0, 1500)}
\`\`\`

## Raw log excerpt
${incident.rawLogExcerpt.slice(0, 800)}

Respond with ONLY valid JSON matching this schema:
{
  "recoverable": boolean,
  "summary": "one sentence for the user",
  "causes": [{
    "id": "cause-1",
    "confidence": "high" | "medium",
    "source": "script_line" | "tts_text" | "topic" | "tone_context" | "sponsor_read" | "image_prompt" | "metadata_prompt",
    "location": { "file": "optional path", "line": optional number, "eventId": "optional" },
    "excerpt": "exact problematic text",
    "triggerPhrases": ["phrase1"],
    "explanation": "plain language why this triggered policy"
  }],
  "actions": [{
    "id": "action-1",
    "type": "replace_text" | "update_config_field" | "skip_event" | "soften_sponsor_read",
    "target": { "file": "workspace/data/script.md", "eventId": "optional", "configPath": "optional" },
    "original": "exact text to replace",
    "proposed": "compliant replacement",
    "rationale": "why this fix should work"
  }]
}

Rules:
- Set recoverable=false only if no compliant rewrite can preserve the show
- Cite exact trigger phrases from the causing input
- Prefer replace_text on script.md or audio_timeline.json event text for TTS blocks
- For sponsor reads, use soften_sponsor_read or replace_text with clinical/neutral wording
- Include at least one action when recoverable=true`;
}

export function buildApplyRemediationPrompt(
  actions: Array<{
    type: string;
    target: { file?: string; eventId?: string; configPath?: string };
    original: string;
    proposed: string;
  }>
): string {
  const actionList = actions
    .map((action, index) => {
      const target = action.target.file ?? action.target.configPath ?? action.target.eventId ?? "unknown";
      return `${index + 1}. Type: ${action.type}
   Target: ${target}${action.target.eventId ? ` (event ${action.target.eventId})` : ""}
   Replace: "${action.original.slice(0, 200)}${action.original.length > 200 ? "…" : ""}"
   With: "${action.proposed.slice(0, 200)}${action.proposed.length > 200 ? "…" : ""}"`;
    })
    .join("\n\n");

  return `POLICY REMEDIATION — apply these exact edits to the workspace. Do NOT modify skill scripts under /.agents/skills/.

${actionList}

Instructions:
- For replace_text on script.md: apply exact string replacement in workspace/data/script.md
- For event text: update the "text" field in workspace/data/audio_timeline.json for the given eventId
- For update_config_field: patch workspace/data/show_config.json at the given JSON path
- For skip_event: remove or mark the event in audio_timeline.json (set text to "[skipped]" and type to "marker")
- Verify files exist before editing
- Reply with one short sentence confirming edits applied`;
}
