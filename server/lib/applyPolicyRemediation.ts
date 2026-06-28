import {
  createInteraction,
  streamInteraction,
  extractInteractionMetadata,
} from "./agentClient.ts";
import { buildApplyRemediationPrompt } from "./policyRemediationPrompt.ts";
import type { PolicyRemediationAction } from "./policyTypes.ts";

export async function applyRemediationToSandbox(
  environmentId: string,
  actions: PolicyRemediationAction[],
  apiKey: string,
  signal?: AbortSignal
): Promise<{ ok: boolean; error?: string }> {
  if (actions.length === 0) {
    return { ok: false, error: "No remediation actions provided" };
  }

  const prompt = buildApplyRemediationPrompt(actions);

  try {
    const response = await createInteraction({
      prompt,
      environmentId,
      stream: true,
      signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      return { ok: false, error: `Agent apply failed: ${response.status} - ${errText}` };
    }

    for await (const event of streamInteraction(response)) {
      if (event.type === "done") break;
      if (event.type === "error") {
        return { ok: false, error: event.message ?? "Stream error during apply" };
      }
      if (event.type === "complete") {
        const meta = extractInteractionMetadata(event.interaction);
        if (!meta.environmentId) {
          console.warn("[applyRemediation] No environmentId in completion meta");
        }
        return { ok: true };
      }
    }

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown apply error";
    return { ok: false, error: message };
  }
}
