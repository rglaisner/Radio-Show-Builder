import { downloadWorkspace } from "./workspaceSalvage.ts";
import {
  detectPolicyError,
  isBlockingPolicyStep,
  isQuotaError,
  isPolicyError,
  stepIndexFromScriptName,
  stepLabelFromIndex,
} from "./policyErrorDetector.ts";
import { extractCausingInput, collectFailedEventIds } from "./policyCausingInput.ts";
import {
  createPolicyIncident,
  loadPolicyIncident,
  setIncidentReview,
  setIncidentStatus,
} from "./policyIncidentStore.ts";
import { runPolicyReviewAgent } from "./policyReviewAgent.ts";
import type { PolicyPausePayload } from "./policyTypes.ts";
import type { ShowConfig } from "../../src/showConfig.ts";
import { stepIndexFromToolCall } from "../../src/pipelineSteps.ts";

export interface PolicyHandlerContext {
  generationId: string;
  showConfig: ShowConfig;
  apiKey: string;
  getState: () => {
    environmentId?: string;
    lastCompletedStep: number;
    currentStepIndex: number;
    ttsToolInFlight: boolean;
  };
  sendEvent: (event: Record<string, unknown>) => void;
  abortRun: () => void;
  onCheckpointUpdate: (patch: { status: "paused_policy"; policyIncidentId: string }) => void;
}

export class PolicyErrorHandler {
  private paused = false;
  private reviewStarted = false;
  private currentStepIndex = 0;
  private ttsToolInFlight = false;

  constructor(private readonly ctx: PolicyHandlerContext) {}

  handleToolCall(name: string, args: Record<string, unknown> | undefined): void {
    const stepIndex = stepIndexFromToolCall(name, args);
    if (stepIndex !== null) {
      this.currentStepIndex = stepIndex;
    }
    const command = JSON.stringify(args ?? {});
    if (command.includes("generate_tts.py")) {
      this.ttsToolInFlight = true;
    }
  }

  handleToolResult(name: string | undefined, _result: string | undefined): void {
    if (name && (name === "bash" || name === "code_execution_call")) {
      if (this.ttsToolInFlight) {
        this.ttsToolInFlight = false;
      }
    }
  }

  async awaitPolicyCheck(text: string, stepIndex?: number): Promise<void> {
    await this.checkAndHandlePolicy(text, stepIndex ?? this.currentStepIndex);
  }

  handleStreamError(message: string): void {
    void this.checkAndHandlePolicy(message, this.currentStepIndex);
  }

  handleApiError(message: string, statusCode?: number): boolean {
    if (isQuotaError(message, statusCode)) return false;
    return isPolicyError(message);
  }

  async handlePolicyText(text: string, stepIndex?: number): Promise<void> {
    await this.checkAndHandlePolicy(text, stepIndex ?? this.currentStepIndex);
  }

  private async checkAndHandlePolicy(text: string, stepIndex: number): Promise<void> {
    const detection = detectPolicyError(text);
    if (!detection) return;

    const effectiveStep =
      stepIndex > 0 ? stepIndex : stepIndexFromScriptName(detection.scriptName);
    const stepLabel = stepLabelFromIndex(effectiveStep);

    if (this.paused) {
      // Additional policy errors (e.g. more TTS events) — update failed event ids
      const existing = loadPolicyIncident(this.ctx.generationId);
      if (existing) {
        const newIds = collectFailedEventIds(text);
        if (newIds.length > 0) {
          const merged = [...new Set([...(existing.failedEventIds ?? []), ...newIds])];
          const { updatePolicyIncident } = await import("./policyIncidentStore.ts");
          updatePolicyIncident(this.ctx.generationId, { failedEventIds: merged });
        }
      }
      return;
    }

    this.paused = true;

    const state = this.ctx.getState();
    let causingInput;
    let failedEventIds = collectFailedEventIds(text);

    if (state.environmentId) {
      try {
        const files = await downloadWorkspace(state.environmentId, this.ctx.apiKey);
        causingInput = extractCausingInput(detection, files, this.ctx.showConfig);
      } catch (error) {
        console.error("[policyHandler] Workspace download failed:", error);
        causingInput = extractCausingInput(detection, null, this.ctx.showConfig);
      }
    } else {
      causingInput = extractCausingInput(detection, null, this.ctx.showConfig);
    }

    if (detection.eventId && !failedEventIds.includes(detection.eventId)) {
      failedEventIds = [...failedEventIds, detection.eventId];
    }

    const incident = createPolicyIncident({
      generationId: this.ctx.generationId,
      stepIndex: effectiveStep,
      stepLabel,
      providerMessage: detection.providerMessage,
      rawLogExcerpt: detection.rawLogExcerpt,
      showConfig: this.ctx.showConfig,
      environmentId: state.environmentId,
      causingInput,
      failedEventIds: failedEventIds.length > 0 ? failedEventIds : undefined,
    });

    this.ctx.onCheckpointUpdate({
      status: "paused_policy",
      policyIncidentId: incident.id,
    });

    const pausePayload: PolicyPausePayload = {
      incidentId: incident.id,
      generationId: this.ctx.generationId,
      stepIndex: effectiveStep,
      stepLabel,
      providerMessage: detection.providerMessage,
      status: "detected",
      causingInput,
    };

    this.ctx.sendEvent({ type: "policy_pause", incident: pausePayload });

    const shouldAbort =
      isBlockingPolicyStep(effectiveStep) || (!this.ttsToolInFlight && effectiveStep === 5);

    if (shouldAbort) {
      this.ctx.abortRun();
    }

    void this.runReview(incident.id);
  }

  private async runReview(incidentId: string): Promise<void> {
    if (this.reviewStarted) return;
    this.reviewStarted = true;

    setIncidentStatus(this.ctx.generationId, "reviewing");
    this.ctx.sendEvent({
      type: "info",
      message: "Analyzing policy issue and preparing remediation…",
    });

    const incident = loadPolicyIncident(this.ctx.generationId);
    if (!incident) return;

    const review = await runPolicyReviewAgent(
      incident,
      this.ctx.showConfig,
      this.ctx.apiKey
    );

    const updated = setIncidentReview(this.ctx.generationId, review);
    if (!updated) return;

    this.ctx.sendEvent({
      type: "policy_review",
      incidentId,
      generationId: this.ctx.generationId,
      review,
    });
  }

  isPaused(): boolean {
    return this.paused;
  }

  isTtsInFlight(): boolean {
    return this.ttsToolInFlight;
  }
}
