import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { ShowConfig } from "../../src/showConfig.ts";
import type {
  PolicyIncident,
  PolicyIncidentStatus,
  PolicyRemediationPlan,
  PolicyReviewResult,
} from "./policyTypes.ts";

const INCIDENT_DIR = path.join(process.cwd(), "output", "policy-incidents");
const INCIDENT_TTL_MS = 24 * 60 * 60 * 1000;

function ensureIncidentDir(): void {
  if (!fs.existsSync(INCIDENT_DIR)) {
    fs.mkdirSync(INCIDENT_DIR, { recursive: true });
  }
}

function incidentPath(generationId: string): string {
  return path.join(INCIDENT_DIR, `${generationId}.json`);
}

export function savePolicyIncident(incident: PolicyIncident): void {
  ensureIncidentDir();
  fs.writeFileSync(incidentPath(incident.generationId), JSON.stringify(incident, null, 2), "utf-8");
}

export function loadPolicyIncident(generationId: string): PolicyIncident | null {
  const filePath = incidentPath(generationId);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const incident = JSON.parse(raw) as PolicyIncident;
    const age = Date.now() - new Date(incident.detectedAt).getTime();
    if (age > INCIDENT_TTL_MS) {
      fs.unlinkSync(filePath);
      return null;
    }
    return incident;
  } catch (error) {
    console.error(`[policyIncident] Failed to load ${generationId}:`, error);
    return null;
  }
}

export function updatePolicyIncident(
  generationId: string,
  patch: Partial<PolicyIncident>
): PolicyIncident | null {
  const existing = loadPolicyIncident(generationId);
  if (!existing) return null;

  const updated: PolicyIncident = { ...existing, ...patch };
  savePolicyIncident(updated);
  return updated;
}

export function createPolicyIncident(params: {
  generationId: string;
  stepIndex: number;
  stepLabel: string;
  providerMessage: string;
  rawLogExcerpt: string;
  showConfig: ShowConfig;
  environmentId?: string;
  causingInput?: PolicyIncident["causingInput"];
  failedEventIds?: string[];
}): PolicyIncident {
  const incident: PolicyIncident = {
    id: randomUUID(),
    generationId: params.generationId,
    detectedAt: new Date().toISOString(),
    stepIndex: params.stepIndex,
    stepLabel: params.stepLabel,
    providerMessage: params.providerMessage,
    rawLogExcerpt: params.rawLogExcerpt,
    causingInput: params.causingInput,
    environmentId: params.environmentId,
    failedEventIds: params.failedEventIds,
    status: "detected",
    showConfig: params.showConfig,
  };
  savePolicyIncident(incident);
  return incident;
}

export function setIncidentStatus(
  generationId: string,
  status: PolicyIncidentStatus
): PolicyIncident | null {
  return updatePolicyIncident(generationId, { status });
}

export function setIncidentReview(
  generationId: string,
  review: PolicyReviewResult
): PolicyIncident | null {
  return updatePolicyIncident(generationId, {
    review,
    remediation: { actions: review.actions },
    status: "awaiting_user",
  });
}

export function setIncidentRemediation(
  generationId: string,
  remediation: PolicyRemediationPlan
): PolicyIncident | null {
  return updatePolicyIncident(generationId, {
    remediation: { ...remediation, appliedAt: new Date().toISOString() },
    status: "applied",
  });
}

export function cleanExpiredPolicyIncidents(): void {
  if (!fs.existsSync(INCIDENT_DIR)) return;
  const now = Date.now();
  for (const file of fs.readdirSync(INCIDENT_DIR)) {
    if (!file.endsWith(".json")) continue;
    const filePath = path.join(INCIDENT_DIR, file);
    try {
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > INCIDENT_TTL_MS) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`[policyIncident] Failed to clean ${filePath}:`, error);
    }
  }
}
