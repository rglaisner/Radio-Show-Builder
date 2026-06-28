import fs from "fs";
import path from "path";

/** Workspace-relative paths persisted for each generation run. */
export const RUN_ARTIFACT_PATHS = [
  "data/show_notes.json",
  "data/script.md",
  "data/quality_report.json",
  "data/audio_timeline.json",
  "data/timeline_manifest.json",
  "data/script_review.json",
  "audio/final/ai_radio.mp3",
  "images/cover.png",
  "audio/music/background.mp3",
] as const;

export interface ExtractedWorkspaceFiles {
  files: Record<string, Buffer>;
  paths: string[];
}

export interface RunArtifactManifest {
  generationId: string;
  createdAt: string;
  topic?: string;
  files: string[];
  hasShowNotes: boolean;
  hasAudio: boolean;
  hasCover: boolean;
  recoveredFromFallback: boolean;
}

export interface ShowPayload {
  show_title: string;
  show_duration: string;
  two_sentence_summary: string;
  date_of_generation: string;
  timecoded_transcript: Array<{
    timecode: string;
    endTimecode?: string;
    speaker: string;
    text: string;
    overlapGroup?: string;
  }>;
  audioUrl?: string;
  coverImage?: string;
  isBase64Encoded?: boolean;
  speakers?: unknown[];
  generation_config?: unknown;
  features_enabled?: string[];
  quality_report?: unknown;
}

function normalizeTarPath(tarPath: string): string {
  return tarPath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function findFileContent(
  extracted: Record<string, Buffer>,
  suffix: string
): { path: string; content: Buffer } | null {
  for (const [filePath, content] of Object.entries(extracted)) {
    const normalized = normalizeTarPath(filePath);
    if (normalized.endsWith(suffix) || normalized.includes(`/${suffix}`)) {
      return { path: normalized, content };
    }
  }
  return null;
}

export function extractTarInMemory(tarBuffer: Buffer): ExtractedWorkspaceFiles {
  const files: Record<string, Buffer> = {};
  let offset = 0;

  while (offset + 512 <= tarBuffer.length) {
    let isEnd = true;
    for (let i = 0; i < 512; i++) {
      if (tarBuffer[offset + i] !== 0) {
        isEnd = false;
        break;
      }
    }
    if (isEnd) break;

    let name = "";
    for (let i = 0; i < 100; i++) {
      const charCode = tarBuffer[offset + i];
      if (charCode === 0) break;
      name += String.fromCharCode(charCode);
    }
    name = name.trim();

    let sizeStr = "";
    for (let i = 124; i < 136; i++) {
      const charCode = tarBuffer[offset + i];
      if (charCode === 0 || charCode === 32) continue;
      sizeStr += String.fromCharCode(charCode);
    }
    const size = parseInt(sizeStr, 8);

    const typeflag = tarBuffer[offset + 156];
    const isRegularFile = typeflag === 0 || typeflag === 48;

    offset += 512;

    if (name && isRegularFile && !isNaN(size) && size > 0) {
      if (offset + size <= tarBuffer.length) {
        files[normalizeTarPath(name)] = tarBuffer.subarray(offset, offset + size);
      }
    }

    const paddedSize = Math.ceil(size / 512) * 512;
    offset += paddedSize;
  }

  return { files, paths: Object.keys(files) };
}

function msToTimecode(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function parseScriptToTranscript(scriptText: string): ShowPayload["timecoded_transcript"] {
  const lines: ShowPayload["timecoded_transcript"] = [];
  let cursorSeconds = 0;

  for (const rawLine of scriptText.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || ["[connect]", "[stinger]", "[hold]"].includes(line)) {
      continue;
    }
    if (!line.includes(":")) continue;

    const colonIndex = line.indexOf(":");
    const speaker = line.slice(0, colonIndex).trim();
    const text = line.slice(colonIndex + 1).trim().replace(/\[[^\]]*\]/g, "").trim();
    if (!text) continue;

    const timecode = msToTimecode(cursorSeconds * 1000);
    lines.push({ timecode, speaker, text });
    cursorSeconds += 12;
  }

  return lines;
}

export function buildShowPayloadFromWorkspace(
  extracted: Record<string, Buffer>,
  options?: { topic?: string; hostName?: string }
): { payload: ShowPayload | null; recoveredFromFallback: boolean; tarPaths: string[] } {
  const tarPaths = Object.keys(extracted);
  let showNotes: ShowPayload | null = null;
  let recoveredFromFallback = false;

  const notesMatch = findFileContent(extracted, "show_notes.json");
  if (notesMatch) {
    try {
      showNotes = JSON.parse(notesMatch.content.toString("utf8")) as ShowPayload;
    } catch (err) {
      console.error("[workspaceArchive] Failed to parse show_notes.json:", err);
    }
  }

  if (!showNotes) {
    const manifestMatch = findFileContent(extracted, "timeline_manifest.json");
    const scriptMatch = findFileContent(extracted, "script.md");
    const audioMatch = findFileContent(extracted, "ai_radio.mp3");

    if (scriptMatch || manifestMatch) {
      recoveredFromFallback = true;
      let transcript: ShowPayload["timecoded_transcript"] = [];
      let durationMs = 0;

      if (manifestMatch) {
        try {
          const manifest = JSON.parse(manifestMatch.content.toString("utf8")) as {
            transcript?: Array<{
              speaker?: string;
              text?: string;
              startMs?: number;
              endMs?: number;
              overlapGroup?: string;
            }>;
            totalDurationMs?: number;
          };
          durationMs = manifest.totalDurationMs ?? 0;
          transcript = (manifest.transcript ?? []).map((entry) => ({
            timecode: msToTimecode(entry.startMs ?? 0),
            endTimecode: entry.endMs != null ? msToTimecode(entry.endMs) : undefined,
            speaker: entry.speaker ?? "Host",
            text: entry.text ?? "",
            overlapGroup: entry.overlapGroup,
          }));
        } catch (err) {
          console.error("[workspaceArchive] Failed to parse timeline_manifest.json:", err);
        }
      }

      if (transcript.length === 0 && scriptMatch) {
        transcript = parseScriptToTranscript(scriptMatch.content.toString("utf8"));
        durationMs = transcript.length * 12000;
      }

      if (transcript.length > 0) {
        const topic = options?.topic?.trim() || "Recovered Radio Show";
        showNotes = {
          show_title: topic.slice(0, 80),
          show_duration: msToTimecode(durationMs || transcript.length * 12000),
          two_sentence_summary: `Recovered show about ${topic}.`,
          date_of_generation: new Date().toISOString().slice(0, 10),
          timecoded_transcript: transcript,
        };
        if (options?.hostName) {
          showNotes.speakers = [{ name: options.hostName, role: "host" }];
        }
      }
    }

    if (!showNotes && !audioMatch) {
      console.error("[workspaceArchive] show_notes.json missing. Tar contents:", tarPaths.slice(0, 50));
      return { payload: null, recoveredFromFallback: false, tarPaths };
    }
  }

  const audioMatch = findFileContent(extracted, "ai_radio.mp3");
  if (audioMatch && showNotes) {
    showNotes.audioUrl = `data:audio/mp3;base64,${audioMatch.content.toString("base64")}`;
  }

  const coverMatch =
    findFileContent(extracted, "cover.png") ??
    findFileContent(extracted, "cover.jpg") ??
    findFileContent(extracted, "cover.jpeg");
  if (coverMatch && showNotes) {
    const mime = coverMatch.path.endsWith(".jpg") || coverMatch.path.endsWith(".jpeg")
      ? "image/jpeg"
      : "image/png";
    showNotes.coverImage = `data:${mime};base64,${coverMatch.content.toString("base64")}`;
  }

  if (showNotes) {
    showNotes.isBase64Encoded = true;
  }

  return { payload: showNotes, recoveredFromFallback, tarPaths };
}

export function getRunsRoot(): string {
  return path.join(process.cwd(), "output", "runs");
}

export function getRunDir(generationId: string): string {
  return path.join(getRunsRoot(), generationId);
}

function resolveWorkspaceRelativePath(tarPath: string): string | null {
  const normalized = normalizeTarPath(tarPath);
  const workspaceIdx = normalized.indexOf("workspace/");
  const relative = workspaceIdx >= 0 ? normalized.slice(workspaceIdx + "workspace/".length) : normalized;

  for (const allowed of RUN_ARTIFACT_PATHS) {
    if (relative === allowed || relative.endsWith(`/${allowed}`)) {
      return allowed;
    }
  }

  if (relative.startsWith("audio/segments/") && relative.endsWith(".wav")) {
    return relative;
  }

  return null;
}

export function persistRunArtifacts(
  generationId: string,
  extracted: Record<string, Buffer>,
  meta: { topic?: string; recoveredFromFallback?: boolean }
): RunArtifactManifest {
  const runDir = getRunDir(generationId);
  fs.mkdirSync(runDir, { recursive: true });

  const savedFiles: string[] = [];

  for (const [tarPath, content] of Object.entries(extracted)) {
    const relative = resolveWorkspaceRelativePath(tarPath);
    if (!relative) continue;

    const destPath = path.join(runDir, relative);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, content);
    savedFiles.push(relative);
  }

  const manifest: RunArtifactManifest = {
    generationId,
    createdAt: new Date().toISOString(),
    topic: meta.topic,
    files: savedFiles.sort(),
    hasShowNotes: savedFiles.some((f) => f.endsWith("show_notes.json")),
    hasAudio: savedFiles.some((f) => f.endsWith("ai_radio.mp3")),
    hasCover: savedFiles.some((f) => f.includes("cover.")),
    recoveredFromFallback: meta.recoveredFromFallback ?? false,
  };

  fs.writeFileSync(path.join(runDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
  return manifest;
}

export function loadRunManifest(generationId: string): RunArtifactManifest | null {
  const manifestPath = path.join(getRunDir(generationId), "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as RunArtifactManifest;
  } catch {
    return null;
  }
}

export function resolveRunFilePath(generationId: string, relativePath: string): string | null {
  const safe = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  if (safe.includes("..")) return null;

  const fullPath = path.join(getRunDir(generationId), safe);
  const runRoot = getRunDir(generationId);
  if (!fullPath.startsWith(runRoot)) return null;
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) return null;
  return fullPath;
}

export function cleanUpOldRunArtifacts(maxAgeDays = 7): void {
  const runsRoot = getRunsRoot();
  if (!fs.existsSync(runsRoot)) return;

  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  for (const entry of fs.readdirSync(runsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(runsRoot, entry.name);
    const stats = fs.statSync(dirPath);
    if (now - stats.mtimeMs > maxAgeMs) {
      try {
        fs.rmSync(dirPath, { recursive: true, force: true });
        console.log(`[cleanup] Removed old run artifacts: ${entry.name}`);
      } catch (err) {
        console.error(`[cleanup] Failed to remove run dir ${dirPath}:`, err);
      }
    }
  }
}
