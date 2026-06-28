import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { countLines, isVerboseText } from './logFormatting';

interface CollapsibleOutputProps {
  text: string;
  isError?: boolean;
  forceCollapsed?: boolean;
  previewLines?: number;
}

export function CollapsibleOutput({
  text,
  isError = false,
  forceCollapsed = false,
  previewLines = 4,
}: CollapsibleOutputProps) {
  const verbose = isVerboseText(text);
  const [expanded, setExpanded] = useState(!verbose && !forceCollapsed);
  const lineCount = countLines(text);

  if (!verbose && !forceCollapsed) {
    return (
      <pre
        className={`bg-black/40 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap font-mono text-xs sm:text-sm border ${
          isError ? 'border-red-500/20 text-red-200/80' : 'border-white/5 text-white/70'
        }`}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {text}
      </pre>
    );
  }

  const lines = text.split('\n');
  const preview = lines.slice(0, previewLines).join('\n');
  const displayText = expanded ? text : preview;

  return (
    <div className="space-y-2">
      <pre
        className={`bg-black/40 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap font-mono text-xs sm:text-sm border ${
          isError ? 'border-red-500/20 text-red-200/80' : 'border-white/5 text-white/70'
        }`}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {displayText}
        {!expanded && lines.length > previewLines ? '\n…' : ''}
      </pre>
      <button
        type="button"
        data-testid="log-expand-output"
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white/45 hover:text-white/70 transition-colors cursor-pointer"
      >
        {expanded ? (
          <>
            <ChevronUp className="w-3 h-3" />
            Show less
          </>
        ) : (
          <>
            <ChevronDown className="w-3 h-3" />
            Show full output ({lineCount} {lineCount === 1 ? 'line' : 'lines'})
          </>
        )}
      </button>
    </div>
  );
}

interface CollapsibleProseProps {
  text: string;
  italic?: boolean;
  previewLines?: number;
}

export function CollapsibleProse({
  text,
  italic = false,
  previewLines = 2,
}: CollapsibleProseProps) {
  const lines = text.split('\n').filter((l) => l.trim());
  const verbose = text.length > 200 || lines.length > previewLines;
  const [expanded, setExpanded] = useState(!verbose);

  if (!verbose) {
    return (
      <p
        className={`font-sans text-sm leading-relaxed text-white/80 ${italic ? 'italic' : ''}`}
      >
        {text}
      </p>
    );
  }

  const preview = lines.slice(0, previewLines).join(' ');

  return (
    <div className="space-y-2">
      <p
        className={`font-sans text-sm leading-relaxed text-white/80 ${italic ? 'italic' : ''}`}
      >
        {expanded ? text : `${preview}…`}
      </p>
      <button
        type="button"
        data-testid="log-expand-prose"
        onClick={() => setExpanded((v) => !v)}
        className="text-[10px] font-bold uppercase tracking-wider text-white/45 hover:text-white/70 transition-colors cursor-pointer"
      >
        {expanded ? 'Show less' : 'Show more'}
      </button>
    </div>
  );
}
