import type { ShowConfig } from "../../src/showConfig.ts";
import type { PolicyCausingInput, PolicyDetection } from "./policyTypes.ts";

function readWorkspaceText(files: Record<string, Buffer>, suffix: string): string | null {
  const key = Object.keys(files).find((p) => p.replace(/\\/g, "/").endsWith(suffix));
  if (!key) return null;
  return files[key].toString("utf-8");
}

function readWorkspaceJson<T>(files: Record<string, Buffer>, suffix: string): T | null {
  const text = readWorkspaceText(files, suffix);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

interface TimelineEvent {
  id?: string;
  type?: string;
  speaker?: string;
  text?: string;
}

export function extractCausingInput(
  detection: PolicyDetection,
  files: Record<string, Buffer> | null,
  showConfig: ShowConfig
): PolicyCausingInput | undefined {
  const eventId = detection.eventId ?? detection.structured?.eventId;
  const blockedText = detection.blockedText ?? detection.structured?.text;

  if (files) {
    if (eventId) {
      const timeline = readWorkspaceJson<{ events?: TimelineEvent[] }>(
        files,
        "audio_timeline.json"
      );
      const event = timeline?.events?.find((e) => e.id === eventId);
      if (event?.text) {
        return {
          source: "tts_prompt",
          file: "workspace/data/audio_timeline.json",
          eventId,
          excerpt: event.text.slice(0, 1500),
        };
      }

      const script = readWorkspaceText(files, "script.md");
      if (script && blockedText) {
        const idx = script.indexOf(blockedText.slice(0, 80));
        if (idx >= 0) {
          const start = Math.max(0, idx - 100);
          return {
            source: "script",
            file: "workspace/data/script.md",
            eventId,
            excerpt: script.slice(start, start + 1500),
          };
        }
      }
    }

    if (detection.scriptName?.includes("generate_script") || detection.scriptName?.includes("script_review")) {
      const script = readWorkspaceText(files, "script.md");
      if (script) {
        return {
          source: "script",
          file: "workspace/data/script.md",
          excerpt: script.slice(0, 1500),
        };
      }
    }

    if (detection.scriptName?.includes("generate_image")) {
      const notes = readWorkspaceText(files, "show_notes.json");
      if (notes) {
        return {
          source: "image_prompt",
          file: "workspace/data/show_notes.json",
          excerpt: notes.slice(0, 1500),
        };
      }
    }

    if (detection.scriptName?.includes("generate_metadata")) {
      const script = readWorkspaceText(files, "script.md");
      if (script) {
        return {
          source: "metadata_prompt",
          file: "workspace/data/script.md",
          excerpt: script.slice(0, 1500),
        };
      }
    }
  }

  if (blockedText) {
    return {
      source: "tts_prompt",
      eventId,
      excerpt: blockedText.slice(0, 1500),
    };
  }

  if (showConfig.features.mockSponsorRead || showConfig.toneContext) {
    const parts: string[] = [];
    if (showConfig.topic) parts.push(`Topic: ${showConfig.topic.slice(0, 400)}`);
    if (showConfig.toneContext) parts.push(`Tone: ${showConfig.toneContext}`);
    if (showConfig.features.mockSponsorRead) parts.push("Mock sponsor read enabled");
    return {
      source: "show_config",
      file: "workspace/data/show_config.json",
      excerpt: parts.join("\n").slice(0, 1500),
    };
  }

  return {
    source: "show_config",
    excerpt: showConfig.topic.slice(0, 500),
  };
}

export function collectFailedEventIds(text: string): string[] {
  const ids = new Set<string>();
  const structuredMatches = text.matchAll(/POLICY_ERROR:(\{[^}]+\})/g);
  for (const match of structuredMatches) {
    try {
      const parsed = JSON.parse(match[1]) as { eventId?: string };
      if (parsed.eventId) ids.add(parsed.eventId);
    } catch {
      // skip
    }
  }
  const bracketMatches = text.matchAll(/\[([evt_][\w\d_]+)\].*(?:policy|blocked|prohibited)/gi);
  for (const match of bracketMatches) {
    if (match[1]) ids.add(match[1]);
  }
  return [...ids];
}
