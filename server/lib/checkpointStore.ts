import fs from "fs";
import path from "path";
import type { ShowConfig } from "../../src/showConfig.ts";
import type { SalvageCompleteness } from "./workspaceSalvage.ts";

export type CheckpointStatus = "running" | "failed" | "salvaged" | "completed";

export interface GenerationCheckpoint {
  generationId: string;
  lastCompletedStep: number;
  canResume: boolean;
  completeness?: SalvageCompleteness;
  interactionId?: string;
  environmentId?: string;
  showConfig: ShowConfig;
  status: CheckpointStatus;
  createdAt: string;
  updatedAt: string;
}

const CHECKPOINT_DIR = path.join(process.cwd(), "output", "checkpoints");
const CHECKPOINT_TTL_MS = 24 * 60 * 60 * 1000;

function ensureCheckpointDir(): void {
  if (!fs.existsSync(CHECKPOINT_DIR)) {
    fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  }
}

function checkpointPath(generationId: string): string {
  return path.join(CHECKPOINT_DIR, `${generationId}.json`);
}

export function saveCheckpoint(checkpoint: GenerationCheckpoint): void {
  ensureCheckpointDir();
  const filePath = checkpointPath(checkpoint.generationId);
  fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2), "utf-8");
}

export function loadCheckpoint(generationId: string): GenerationCheckpoint | null {
  const filePath = checkpointPath(generationId);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const checkpoint = JSON.parse(raw) as GenerationCheckpoint;
    const age = Date.now() - new Date(checkpoint.updatedAt).getTime();
    if (age > CHECKPOINT_TTL_MS) {
      fs.unlinkSync(filePath);
      return null;
    }
    return checkpoint;
  } catch (error) {
    console.error(`[checkpoint] Failed to load checkpoint ${generationId}:`, error);
    return null;
  }
}

export function updateCheckpoint(
  generationId: string,
  patch: Partial<GenerationCheckpoint> & { showConfig?: ShowConfig }
): GenerationCheckpoint | null {
  const existing = loadCheckpoint(generationId);
  if (!existing && !patch.showConfig) {
    console.error(`[checkpoint] Cannot create checkpoint ${generationId} without showConfig`);
    return null;
  }

  const now = new Date().toISOString();
  const checkpoint: GenerationCheckpoint = {
    generationId,
    lastCompletedStep: 0,
    canResume: false,
    showConfig: patch.showConfig ?? existing!.showConfig,
    status: "running",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...existing,
    ...patch,
  };
  saveCheckpoint(checkpoint);
  return checkpoint;
}

export function cleanExpiredCheckpoints(): void {
  if (!fs.existsSync(CHECKPOINT_DIR)) return;

  const now = Date.now();
  for (const file of fs.readdirSync(CHECKPOINT_DIR)) {
    if (!file.endsWith(".json")) continue;
    const filePath = path.join(CHECKPOINT_DIR, file);
    try {
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > CHECKPOINT_TTL_MS) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`[checkpoint] Failed to clean ${filePath}:`, error);
    }
  }
}
