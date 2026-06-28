import type { ShowConfig } from "../../src/showConfig.ts";
import type { RawRadioShow } from "../../src/types.ts";
import { detectCompletedStepFromFiles } from "../../src/pipelineSteps.ts";
import { API_BASE_URL } from "./agentClient.ts";
import {
  buildShowPayloadFromWorkspace,
  extractTarInMemory,
  persistRunArtifacts,
} from "./workspaceArchive.ts";

export type SalvageCompleteness = "full" | "playable" | "partial";

export interface SalvagedShow extends RawRadioShow {
  completeness: SalvageCompleteness;
  lastCompletedStep: number;
  canResume: boolean;
  isPartial?: boolean;
  isBase64Encoded?: boolean;
}

export async function downloadWorkspace(
  envId: string,
  apiKey: string
): Promise<Record<string, Buffer>> {
  const downloadUrl = `${API_BASE_URL}/files/environment-${envId}:download?alt=media`;
  const response = await fetch(downloadUrl, {
    headers: { "x-goog-api-key": apiKey },
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Failed to download workspace: ${response.status} - ${errBody}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return extractTarInMemory(Buffer.from(arrayBuffer)).files;
}

function hasAudio(files: Record<string, Buffer>): boolean {
  return Object.keys(files).some((filePath) => filePath.endsWith("ai_radio.mp3"));
}

function hasShowNotes(files: Record<string, Buffer>): boolean {
  return Object.keys(files).some((filePath) => filePath.endsWith("show_notes.json"));
}

export function salvageCompleteness(
  lastCompletedStep: number,
  hasAudioFile: boolean,
  hasNotesFile: boolean
): SalvageCompleteness {
  if (hasNotesFile && hasAudioFile) return "full";
  if (hasAudioFile) return "playable";
  if (lastCompletedStep >= 2) return "partial";
  return "partial";
}

export function assembleShowFromWorkspace(
  files: Record<string, Buffer>,
  showConfig: ShowConfig,
  generationId?: string
): SalvagedShow | null {
  const lastCompletedStep = detectCompletedStepFromFiles(files);
  const audioPresent = hasAudio(files);
  const notesPresent = hasShowNotes(files);

  const { payload, recoveredFromFallback } = buildShowPayloadFromWorkspace(files, {
    topic: showConfig.topic,
    hostName: showConfig.host.name,
  });

  if (!payload && !audioPresent && lastCompletedStep < 2) {
    return null;
  }

  if (generationId) {
    persistRunArtifacts(generationId, files, {
      topic: showConfig.topic,
      recoveredFromFallback,
    });
  }

  const completeness = salvageCompleteness(lastCompletedStep, audioPresent, notesPresent);
  const canResume = lastCompletedStep > 0 && lastCompletedStep < 11;

  const show: SalvagedShow = {
    ...(payload ?? {
      show_title: showConfig.topic,
      show_duration: `${String(showConfig.durationMinutes).padStart(2, "0")}:00`,
      two_sentence_summary: `Partial show about ${showConfig.topic}.`,
      date_of_generation: new Date().toISOString().slice(0, 10),
      timecoded_transcript: [],
    }),
    completeness,
    lastCompletedStep,
    canResume,
    isPartial: completeness !== "full",
    isBase64Encoded: payload?.isBase64Encoded ?? audioPresent,
  };

  return show;
}

export function detectCompletedStep(files: Record<string, Buffer>): number {
  return detectCompletedStepFromFiles(files);
}
