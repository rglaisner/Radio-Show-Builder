import type { ReactNode } from 'react';

export function scrubText(text: string): string {
  if (!text) return text;
  return text
    .replace(/(GEMINI_API_KEY\s*(?:=|:)\s*)[^\s"'\\]+/g, '$1***')
    .replace(/("GEMINI_API_KEY"\s*:\s*")[^"]+"/g, '$1***"')
    .replace(/AIza[a-zA-Z0-9_-]{35}/g, '***')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

export function humanizeToolName(name: string): string {
  const map: Record<string, string> = {
    read_file: 'Read file',
    list_files: 'List files',
    write_file: 'Write file',
    bash: 'Run command',
    google_search: 'Google search',
    code_execution_call: 'Run command',
  };
  return map[name] || name;
}

const FILE_TOOLS = new Set(['read_file', 'list_files', 'write_file']);

export function isFileTool(name: string | undefined): boolean {
  return !!name && FILE_TOOLS.has(name);
}

export function isCommandTool(name: string | undefined, args?: Record<string, unknown>): boolean {
  if (!name) return false;
  if (name === 'bash' || name === 'code_execution_call') return true;
  return !!(args && (args.command || args.code));
}

function unwrapJson(value: unknown): unknown {
  let current = value;
  for (let i = 0; i < 5; i++) {
    if (typeof current !== 'string') break;
    const trimmed = current.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[') && !trimmed.startsWith('"')) {
      break;
    }
    try {
      current = JSON.parse(trimmed);
    } catch {
      if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        try {
          const unescaped = trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
          current = JSON.parse(unescaped);
        } catch {
          break;
        }
      } else {
        break;
      }
    }
  }
  return current;
}

export interface ParsedToolResult {
  text: string;
  isError: boolean;
  files?: string[];
}

export function parseToolResult(
  name: string | undefined,
  rawResult: string | undefined
): ParsedToolResult | null {
  if (!rawResult) return null;

  let data = unwrapJson(rawResult);
  if (data && typeof data === 'object' && data !== null && 'result' in data) {
    const inner = unwrapJson((data as Record<string, unknown>).result);
    if (inner !== undefined) data = inner;
  }

  if (name === 'list_files' && data && typeof data === 'object' && data !== null) {
    const files = (data as { files?: string[] }).files;
    if (Array.isArray(files)) {
      return { text: files.join('\n'), isError: false, files };
    }
  }

  let textToShow = '';
  if (name === 'read_file' && data && typeof data === 'object' && data !== null) {
    const record = data as Record<string, unknown>;
    if (typeof record.content === 'string') textToShow = record.content;
    else if (typeof record.error === 'string') textToShow = record.error;
  } else if (name === 'bash' && data) {
    if (typeof data === 'object' && data !== null) {
      const record = data as Record<string, unknown>;
      if (typeof record.output === 'string') textToShow = record.output;
      else if (typeof record.error === 'string') textToShow = record.error;
      else textToShow = JSON.stringify(data, null, 2);
    } else {
      textToShow = String(data);
    }
  } else if (typeof data === 'object' && data !== null) {
    textToShow = JSON.stringify(data, null, 2);
  } else {
    textToShow = String(data);
  }

  textToShow = textToShow.replace(/\\n/g, '\n').replace(/\\"/g, '"');
  const scrubbed = scrubText(textToShow);
  const isError =
    scrubbed.includes('"error"') ||
    scrubbed.startsWith('Error:') ||
    scrubbed.toLowerCase().includes('traceback');

  return { text: scrubbed, isError };
}

export function countLines(text: string): number {
  if (!text) return 0;
  return text.split('\n').length;
}

export function isVerboseText(text: string): boolean {
  return text.length > 300 || countLines(text) > 6;
}

export function renderMarkdown(text: string): ReactNode {
  const html = text
    .replace(
      /```([\s\S]*?)```/g,
      '<pre class="bg-black/40 p-3 rounded-lg text-white/70 overflow-x-auto whitespace-pre-wrap font-mono text-xs sm:text-sm border border-white/5 my-2">$1</pre>'
    )
    .replace(
      /`([^`]+)`/g,
      '<code class="bg-white/10 px-1 py-0.5 rounded text-io-blue font-mono text-xs">$1</code>'
    )
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export function getToolCallCommand(args?: Record<string, unknown>): string | null {
  if (!args) return null;
  if (typeof args.command === 'string') return args.command;
  if (typeof args.code === 'string') return args.code;
  return null;
}

export function getToolCallPath(args?: Record<string, unknown>): string | null {
  if (!args || typeof args.path !== 'string') return null;
  return args.path;
}
