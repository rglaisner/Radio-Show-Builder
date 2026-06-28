import {
  createInteraction,
  streamInteraction,
  extractInteractionMetadata,
  pollInteractionUntilComplete,
} from "./agentClient.ts";
import { extractJsonBlocks } from "./jsonExtractor.ts";
import {
  assembleShowFromWorkspace,
  downloadWorkspace,
  type SalvagedShow,
} from "./workspaceSalvage.ts";
import { loadRunManifest } from "./workspaceArchive.ts";
import {
  saveCheckpoint,
  updateCheckpoint,
  type GenerationCheckpoint,
} from "./checkpointStore.ts";
import type { ShowConfig } from "../../src/showConfig.ts";
import { stepIndexFromToolCall } from "../../src/pipelineSteps.ts";
import { isQuotaError, isPolicyError } from "./policyErrorDetector.ts";
import { PolicyErrorHandler } from "./policyErrorHandler.ts";

export interface GenerationRunState {
  generationId: string;
  showConfig: ShowConfig;
  interactionId?: string;
  environmentId?: string;
  lastCompletedStep: number;
  status: GenerationCheckpoint["status"];
}

export interface GenerationRunnerOptions {
  generationId: string;
  showConfig: ShowConfig;
  prompt: string;
  apiKey: string;
  signal: AbortSignal;
  sendEvent: (event: Record<string, unknown>) => void;
  environmentId?: string;
  previousInteractionId?: string;
  inlineSources?: Array<{ type: string; content: string; target: string }>;
  abortController?: AbortController;
}

export interface GenerationRunnerResult {
  completed: boolean;
  salvaged: boolean;
  showDelivered: boolean;
}

function emitCheckpoint(
  state: GenerationRunState,
  sendEvent: (event: Record<string, unknown>) => void,
  patch?: Partial<GenerationCheckpoint>
): void {
  const checkpoint = updateCheckpoint(state.generationId, {
    generationId: state.generationId,
    showConfig: state.showConfig,
    interactionId: state.interactionId,
    environmentId: state.environmentId,
    lastCompletedStep: state.lastCompletedStep,
    canResume: state.lastCompletedStep > 0 && state.lastCompletedStep < 11,
    status: state.status,
    ...patch,
  });

  if (!checkpoint) return;

      sendEvent({
      type: "checkpoint",
      data: {
        generationId: checkpoint.generationId,
        lastCompletedStep: checkpoint.lastCompletedStep,
        canResume: checkpoint.canResume,
        completeness: checkpoint.completeness,
        interactionId: checkpoint.interactionId,
        environmentId: checkpoint.environmentId,
        status: checkpoint.status,
        policyIncidentId: checkpoint.policyIncidentId,
      },
    });
}

async function resolveEnvironmentId(
  state: GenerationRunState,
  apiKey: string,
  sendEvent: (event: Record<string, unknown>) => void
): Promise<string | undefined> {
  if (state.environmentId) return state.environmentId;

  if (!state.interactionId) return undefined;

  sendEvent({
    type: "info",
    message: "Polling agent for workspace snapshot...",
  });
  const interaction = await pollInteractionUntilComplete(state.interactionId, apiKey);
  if (!interaction) return undefined;

  const { environmentId } = extractInteractionMetadata(
    interaction as Record<string, unknown>
  );
  if (environmentId) {
    state.environmentId = environmentId;
  }
  return environmentId;
}

async function attemptSalvage(
  state: GenerationRunState,
  apiKey: string,
  sendEvent: (event: Record<string, unknown>) => void
): Promise<SalvagedShow | null> {
  const envId = await resolveEnvironmentId(state, apiKey, sendEvent);
  if (!envId) {
    state.status = "failed";
    emitCheckpoint(state, sendEvent);
    return null;
  }

  try {
    sendEvent({
      type: "info",
      message: "Attempting to salvage partial show output from workspace...",
    });

    const files = await downloadWorkspace(envId, apiKey);
    const salvaged = assembleShowFromWorkspace(files, state.showConfig, state.generationId);
    if (!salvaged) {
      state.status = "failed";
      emitCheckpoint(state, sendEvent, { environmentId: envId });
      return null;
    }

    state.lastCompletedStep = Math.max(
      state.lastCompletedStep,
      salvaged.lastCompletedStep
    );
    state.environmentId = envId;
    state.status = salvaged.completeness === "full" ? "completed" : "salvaged";

    emitCheckpoint(state, sendEvent, {
      environmentId: envId,
      completeness: salvaged.completeness,
      canResume: salvaged.canResume,
    });

    sendEvent({
      type: "salvage_data",
      data: salvaged,
      completeness: salvaged.completeness,
      lastCompletedStep: salvaged.lastCompletedStep,
      canResume: salvaged.canResume,
    });

    const manifest = loadRunManifest(state.generationId);
    if (manifest) {
      sendEvent({
        type: "run_artifacts",
        generationId: state.generationId,
        files: manifest.files,
        hasAudio: manifest.hasAudio,
        hasShowNotes: manifest.hasShowNotes,
        hasCover: manifest.hasCover,
      });
    }

    return salvaged;
  } catch (error) {
    console.error(`[generationRunner] Salvage failed for ${state.generationId}:`, error);
    state.status = "failed";
    emitCheckpoint(state, sendEvent, { environmentId: envId });
    return null;
  }
}

async function deliverWorkspace(
  envId: string,
  showConfig: ShowConfig,
  generationId: string,
  sendEvent: (event: Record<string, unknown>) => void
): Promise<SalvagedShow | null> {
  const apiKey = process.env.GEMINI_API_KEY || "";
  sendEvent({ type: "info", message: "Processing final audio and metadata in memory..." });

  const files = await downloadWorkspace(envId, apiKey);
  const salvaged = assembleShowFromWorkspace(files, showConfig, generationId);

  if (!salvaged) {
    sendEvent({
      type: "error",
      message: "Workspace download succeeded but no usable show artifacts were found.",
    });
    return null;
  }

  if (salvaged.completeness === "full") {
    sendEvent({ type: "show_data", data: salvaged });
  } else {
    sendEvent({
      type: "salvage_data",
      data: salvaged,
      completeness: salvaged.completeness,
      lastCompletedStep: salvaged.lastCompletedStep,
      canResume: salvaged.canResume,
    });
  }

  const manifest = loadRunManifest(generationId);
  if (manifest) {
    sendEvent({
      type: "run_artifacts",
      generationId,
      files: manifest.files,
      hasAudio: manifest.hasAudio,
      hasShowNotes: manifest.hasShowNotes,
      hasCover: manifest.hasCover,
    });
  }

  return salvaged;
}

export async function runGeneration(
  options: GenerationRunnerOptions
): Promise<GenerationRunnerResult> {
  const {
    generationId,
    showConfig,
    prompt,
    apiKey,
    signal,
    sendEvent,
    environmentId,
    previousInteractionId,
    inlineSources,
    abortController,
  } = options;

  let currentStepIndex = 0;

  const state: GenerationRunState = {
    generationId,
    showConfig,
    environmentId,
    interactionId: previousInteractionId,
    lastCompletedStep: 0,
    status: "running",
  };

  const policyHandler = new PolicyErrorHandler({
    generationId,
    showConfig,
    apiKey,
    getState: () => ({
      environmentId: state.environmentId,
      lastCompletedStep: state.lastCompletedStep,
      currentStepIndex,
      ttsToolInFlight: policyHandler.isTtsInFlight(),
    }),
    sendEvent,
    abortRun: () => abortController?.abort(),
    onCheckpointUpdate: (patch) => {
      state.status = patch.status;
      emitCheckpoint(state, sendEvent, {
        status: patch.status,
        policyIncidentId: patch.policyIncidentId,
        canResume: true,
      });
    },
  });

  saveCheckpoint({
    generationId,
    showConfig,
    lastCompletedStep: 0,
    canResume: false,
    interactionId: previousInteractionId,
    environmentId,
    status: "running",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  let accumulatedText = "";
  let showDelivered = false;
  let salvaged = false;
  let completed = false;

  try {
    const response = await createInteraction({
      prompt,
      stream: true,
      inlineSources: environmentId ? undefined : inlineSources,
      environmentId,
      previousInteractionId,
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let displayMessage = `Agent API error: ${response.status} - ${errorText}`;
      try {
        const parsed = JSON.parse(errorText) as { error?: { message?: string } };
        if (parsed?.error?.message) {
          displayMessage = parsed.error.message;
        }
      } catch {
        // keep default message
      }

      const quotaError = isQuotaError(errorText, response.status);

      if (quotaError) {
        displayMessage = `Gemini API Quota Limit Reached: ${displayMessage}. The shared free-tier Google Gemini API Key has run out of request quota. To resolve this, go to Settings > Secrets inside AI Studio to verify your personal Gemini API key or set up billing.`;
      }

      const isPolicy = isPolicyError(displayMessage);

      sendEvent({
        type: "error",
        message: displayMessage,
        ...(isPolicy ? { code: "policy" } : {}),
      });

      if (isPolicy) {
        await policyHandler.handlePolicyText(displayMessage, currentStepIndex);
        state.status = "paused_policy";
        emitCheckpoint(state, sendEvent, { canResume: true });
        return { completed: false, salvaged: false, showDelivered: false };
      }

      if (quotaError) {
        state.status = "failed";
        emitCheckpoint(state, sendEvent);
        await attemptSalvage(state, apiKey, sendEvent);
        return { completed: false, salvaged: false, showDelivered: false };
      }

      state.status = "failed";
      emitCheckpoint(state, sendEvent);
      await attemptSalvage(state, apiKey, sendEvent);
      return { completed: false, salvaged: false, showDelivered: false };
    }

    for await (const event of streamInteraction(response)) {
      if (event.type === "done") break;

      if (event.type === "interaction_meta" || event.type === "complete") {
        const meta = extractInteractionMetadata(event.interaction);
        if (meta.interactionId) state.interactionId = meta.interactionId;
        if (meta.environmentId) state.environmentId = meta.environmentId;
        emitCheckpoint(state, sendEvent);
      }

      if (event.type === "complete") {
        const usage = event.interaction?.usage as Record<string, unknown> | undefined;
        if (usage) {
          console.log(
            `[generationRunner] Token usage: ${usage.total_tokens} total (${usage.total_input_tokens} input, ${usage.total_output_tokens} output)`
          );
        }

        const stepsObj = event.interaction?.steps as unknown[] | undefined;
        if (Array.isArray(stepsObj)) {
          let combinedStepsText = "";
          for (const step of stepsObj) {
            const stepRecord = step as Record<string, unknown>;
            const isReasoningStep =
              stepRecord.type === "thinking" ||
              stepRecord.type === "thought" ||
              stepRecord.type === "reasoning";
            if (!isReasoningStep && Array.isArray(stepRecord.content)) {
              for (const part of stepRecord.content) {
                if (part && typeof part === "object") {
                  const partRecord = part as Record<string, unknown>;
                  if (partRecord.type === "text" && typeof partRecord.text === "string") {
                    combinedStepsText += partRecord.text;
                  } else if (typeof partRecord.text === "string" && partRecord.type !== "thought") {
                    combinedStepsText += partRecord.text;
                  }
                } else if (typeof part === "string") {
                  combinedStepsText += part;
                }
              }
            }
          }
          if (combinedStepsText.length > accumulatedText.length) {
            accumulatedText = combinedStepsText;
          }
        }
      }

      if (event.type === "tool_call") {
        const stepIndex = stepIndexFromToolCall(event.name ?? "", event.arguments);
        if (stepIndex !== null) {
          currentStepIndex = stepIndex;
          state.lastCompletedStep = Math.max(state.lastCompletedStep, stepIndex);
          emitCheckpoint(state, sendEvent);
        }
        policyHandler.handleToolCall(event.name ?? "", event.arguments);
      }

      if (event.type === "tool_result") {
        if (event.result) {
          await policyHandler.awaitPolicyCheck(event.result, currentStepIndex);
        }
        policyHandler.handleToolResult(event.name, event.result);
        if (policyHandler.isPaused()) {
          sendEvent(event as Record<string, unknown>);
          break;
        }
      }

      if (
        event.type === "thinking" ||
        event.type === "text" ||
        event.type === "tool_call" ||
        event.type === "tool_result"
      ) {
        sendEvent(event as Record<string, unknown>);
      }

      if (event.type === "text" && event.text) {
        accumulatedText += event.text;
        if (event.text.includes("POLICY_ERROR:")) {
          void policyHandler.handleStreamError(event.text);
        }
      }

      if (event.type === "error") {
        const message = event.message ?? "Unknown stream error";
        policyHandler.handleStreamError(message);
        sendEvent({
          type: "error",
          message,
          ...(policyHandler.isPaused() ? { code: "policy" } : {}),
        });
        if (policyHandler.isPaused()) break;
      }
    }

    if (policyHandler.isPaused()) {
      state.status = "paused_policy";
      emitCheckpoint(state, sendEvent, { canResume: true });
      return { completed: false, salvaged: false, showDelivered: false };
    }

    if (accumulatedText) {
      try {
        const blocks = extractJsonBlocks(accumulatedText);
        if (blocks.length > 0) {
          sendEvent({ type: "show_data", data: blocks[blocks.length - 1] });
          showDelivered = true;
          completed = true;
          state.status = "completed";
          emitCheckpoint(state, sendEvent, { completeness: "full" });
        }
      } catch (error) {
        console.error("[generationRunner] JSON fallback parse failed:", error);
      }
    }

    if (!showDelivered && state.environmentId) {
      const delivered = await deliverWorkspace(
        state.environmentId,
        showConfig,
        generationId,
        sendEvent
      );
      if (delivered) {
        showDelivered = true;
        salvaged = delivered.completeness !== "full";
        completed = delivered.completeness === "full";
        state.status = completed ? "completed" : "salvaged";
        state.lastCompletedStep = Math.max(state.lastCompletedStep, delivered.lastCompletedStep);
        emitCheckpoint(state, sendEvent, {
          completeness: delivered.completeness,
          canResume: delivered.canResume,
        });
      }
    }

    if (!showDelivered) {
      const salvageResult = await attemptSalvage(state, apiKey, sendEvent);
      if (salvageResult) {
        showDelivered = true;
        salvaged = true;
        completed = salvageResult.completeness === "full";
      } else if (state.status === "running") {
        state.status = "failed";
        emitCheckpoint(state, sendEvent);
        sendEvent({
          type: "error",
          message: "Generation ended without a deliverable show. You may retry from the last completed step if a checkpoint was saved.",
        });
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.log(`[generationRunner] Aborted: ${generationId}`);
      if (policyHandler.isPaused()) {
        state.status = "paused_policy";
        emitCheckpoint(state, sendEvent, { canResume: true });
      } else {
        state.status = "failed";
        emitCheckpoint(state, sendEvent);
      }
    } else {
      console.error(`[generationRunner] Error for ${generationId}:`, error);
      const message = error instanceof Error ? error.message : "Unknown error";
      sendEvent({ type: "error", message });
      state.status = "failed";
      emitCheckpoint(state, sendEvent);
      const salvageResult = await attemptSalvage(state, apiKey, sendEvent);
      if (salvageResult) {
        showDelivered = true;
        salvaged = true;
        completed = salvageResult.completeness === "full";
      }
    }
  }

  return { completed, salvaged, showDelivered };
}

export async function salvageFromCheckpoint(
  generationId: string,
  apiKey: string,
  sendEvent: (event: Record<string, unknown>) => void
): Promise<SalvagedShow | null> {
  const { loadCheckpoint } = await import("./checkpointStore.ts");
  const checkpoint = loadCheckpoint(generationId);
  if (!checkpoint) {
    sendEvent({ type: "error", message: "No salvageable checkpoint found for this generation." });
    return null;
  }

  const state: GenerationRunState = {
    generationId,
    showConfig: checkpoint.showConfig,
    interactionId: checkpoint.interactionId,
    environmentId: checkpoint.environmentId,
    lastCompletedStep: checkpoint.lastCompletedStep,
    status: checkpoint.status,
  };

  return attemptSalvage(state, apiKey, sendEvent);
}
