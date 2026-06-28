import { motion } from 'motion/react';
import { FileText, FolderOpen } from 'lucide-react';
import { CategoryBadge } from './CategoryBadge';
import { CollapsibleOutput, CollapsibleProse } from './CollapsibleOutput';
import {
  getToolCallCommand,
  getToolCallPath,
  humanizeToolName,
  isCommandTool,
  isFileTool,
  parseToolResult,
  renderMarkdown,
  scrubText,
} from './logFormatting';
import type { ActionGroupItem, GenerationLogEntry, LogCategory, SingleLogItem } from './types';

interface GenerationLogEntryProps {
  item: SingleLogItem | ActionGroupItem;
  hideVerbose?: boolean;
}

function Timestamp({ value, className = '' }: { value: string; className?: string }) {
  return (
    <time className={`text-[10px] text-white/40 font-mono shrink-0 ${className}`}>{value}</time>
  );
}

function FileActionBody({ name, args }: { name: string; args?: Record<string, unknown> }) {
  const path = getToolCallPath(args);
  const Icon = name === 'list_files' ? FolderOpen : FileText;

  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="w-4 h-4 text-io-yellow shrink-0 mt-0.5" />
      <div className="min-w-0 space-y-1">
        <span className="font-sans text-sm text-white/85">{humanizeToolName(name)}</span>
        {path ? (
          <code className="block text-xs font-mono text-white/60 bg-black/30 px-2 py-1 rounded-md border border-white/5 break-all">
            {path}
          </code>
        ) : null}
      </div>
    </div>
  );
}

function CommandBody({ args }: { args?: Record<string, unknown> }) {
  const command = getToolCallCommand(args);
  const language =
    args && typeof args.language === 'string' ? args.language : null;

  if (!command) {
    return (
      <pre className="bg-black/40 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap font-mono text-xs sm:text-sm border border-white/5 text-white/70">
        {scrubText(JSON.stringify(args ?? {}, null, 2))}
      </pre>
    );
  }

  return (
    <div className="bg-black/50 rounded-lg border border-white/8 overflow-hidden">
      {language ? (
        <div className="px-3 py-1 border-b border-white/5 text-[10px] font-mono text-white/35 uppercase">
          {language}
        </div>
      ) : null}
      <pre
        className="p-3 overflow-x-auto whitespace-pre-wrap font-mono text-xs sm:text-sm text-white/75"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <span className="text-io-green select-none">$ </span>
        {scrubText(command)}
      </pre>
    </div>
  );
}

function ToolResultBody({
  name,
  result,
  forceCollapsed,
}: {
  name?: string;
  result?: string;
  forceCollapsed?: boolean;
}) {
  const parsed = parseToolResult(name, result);
  if (!parsed) return null;

  if (parsed.files) {
    return (
      <div className="bg-black/40 p-3 rounded-lg border border-white/5">
        <div className="flex flex-col gap-1">
          {parsed.files.map((file) => (
            <div
              key={file}
              className="flex items-center gap-2 text-white/70 font-mono text-xs"
            >
              <div className="w-1 h-1 rounded-full bg-white/30 shrink-0" />
              <span className="break-all">{file}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <CollapsibleOutput
      text={parsed.text}
      isError={parsed.isError}
      forceCollapsed={forceCollapsed}
    />
  );
}

function StatusRow({ entry }: { entry: GenerationLogEntry }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      data-testid="log-entry-status"
      className="flex items-start gap-3 py-1 min-w-0"
    >
      <CategoryBadge category="status" />
      <p className="font-sans text-sm text-white/60 leading-relaxed min-w-0 flex-1">
        {scrubText(entry.content || '')}
      </p>
      <Timestamp value={entry.timestamp} />
    </motion.div>
  );
}

function ErrorCard({ entry }: { entry: GenerationLogEntry }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      data-testid="log-entry-error"
      className="rounded-xl border border-red-500/25 bg-red-500/8 p-3 sm:p-4 min-w-0 border-l-4 border-l-red-400"
    >
      <header className="flex items-center gap-2 mb-2">
        <CategoryBadge category="error" />
        <Timestamp value={entry.timestamp} className="ml-auto" />
      </header>
      <div className="font-sans text-sm text-red-200/90 leading-relaxed min-w-0">
        {renderMarkdown(scrubText(entry.content || ''))}
      </div>
    </motion.article>
  );
}

function ProseCard({
  entry,
  category,
  italic,
}: {
  entry: GenerationLogEntry;
  category: 'planning' | 'agent';
  italic?: boolean;
}) {
  const accent =
    category === 'planning' ? 'border-l-violet-400' : 'border-l-io-blue';

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      data-testid={`log-entry-${category}`}
      className={`rounded-xl border border-white/8 bg-white/[0.03] p-3 sm:p-4 min-w-0 border-l-4 ${accent}`}
    >
      <header className="flex items-center gap-2 mb-2">
        <CategoryBadge category={category} />
        <Timestamp value={entry.timestamp} className="ml-auto" />
      </header>
      <div className="min-w-0">
        {category === 'planning' ? (
          <CollapsibleProse text={scrubText(entry.content || '')} italic={italic} />
        ) : (
          <div className="font-sans text-sm leading-relaxed text-white/80 min-w-0">
            {renderMarkdown(scrubText(entry.content || ''))}
          </div>
        )}
      </div>
    </motion.article>
  );
}

function ActionGroupCard({
  group,
  hideVerbose,
}: {
  group: ActionGroupItem;
  hideVerbose?: boolean;
}) {
  const { call, result } = group;
  const name = call.name || '';
  const fileAction = isFileTool(name);
  const commandAction = isCommandTool(name, call.args);

  let category: LogCategory = 'action';
  if (commandAction) category = 'command';
  else if (fileAction) category = 'file';

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      data-testid="log-entry-action-group"
      className="rounded-xl border border-white/8 bg-white/[0.03] p-3 sm:p-4 min-w-0 border-l-4 border-l-io-blue"
    >
      <header className="flex items-center gap-2 mb-3">
        <CategoryBadge category={category} />
        <span className="font-sans text-sm font-medium text-white/85 truncate">
          {humanizeToolName(name)}
        </span>
        <Timestamp value={group.timestamp} className="ml-auto" />
      </header>

      <div className="space-y-3 min-w-0">
        {fileAction ? (
          <FileActionBody name={name} args={call.args} />
        ) : commandAction ? (
          <CommandBody args={call.args} />
        ) : (
          <CommandBody args={call.args} />
        )}

        {result ? (
          <div className="space-y-1.5">
            <CategoryBadge category="output" />
            <ToolResultBody
              name={result.name}
              result={result.result}
              forceCollapsed={hideVerbose}
            />
          </div>
        ) : null}
      </div>
    </motion.article>
  );
}

function SingleToolCallCard({ entry }: { entry: GenerationLogEntry }) {
  const name = entry.name || '';
  const fileAction = isFileTool(name);
  const commandAction = isCommandTool(name, entry.args);
  const category: LogCategory = fileAction ? 'file' : commandAction ? 'command' : 'action';

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      data-testid="log-entry-tool-call"
      className="rounded-xl border border-white/8 bg-white/[0.03] p-3 sm:p-4 min-w-0 border-l-4 border-l-io-blue"
    >
      <header className="flex items-center gap-2 mb-3">
        <CategoryBadge category={category} />
        <span className="font-sans text-sm font-medium text-white/85 truncate">
          {humanizeToolName(name)}
        </span>
        <Timestamp value={entry.timestamp} className="ml-auto" />
      </header>
      <div className="min-w-0">
        {fileAction ? (
          <FileActionBody name={name} args={entry.args} />
        ) : (
          <CommandBody args={entry.args} />
        )}
      </div>
    </motion.article>
  );
}

function ToolResultCard({
  entry,
  hideVerbose,
}: {
  entry: GenerationLogEntry;
  hideVerbose?: boolean;
}) {
  const parsed = parseToolResult(entry.name, entry.result);
  const isError = parsed?.isError ?? false;

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      data-testid="log-entry-tool-result"
      className={`rounded-xl border bg-white/[0.03] p-3 sm:p-4 min-w-0 border-l-4 ${
        isError ? 'border-red-500/25 border-l-red-400' : 'border-white/8 border-l-io-green'
      }`}
    >
      <header className="flex items-center gap-2 mb-3">
        <CategoryBadge category="output" />
        <span className="font-sans text-sm font-medium text-white/85 truncate">
          {humanizeToolName(entry.name || 'output')}
        </span>
        <Timestamp value={entry.timestamp} className="ml-auto" />
      </header>
      <div className="min-w-0">
        <ToolResultBody
          name={entry.name}
          result={entry.result}
          forceCollapsed={hideVerbose}
        />
      </div>
    </motion.article>
  );
}

export function GenerationLogEntryRow({ item, hideVerbose }: GenerationLogEntryProps) {
  if (item.kind === 'action_group') {
    return <ActionGroupCard group={item} hideVerbose={hideVerbose} />;
  }

  const { entry } = item;

  if (entry.type === 'info') return <StatusRow entry={entry} />;
  if (entry.type === 'error') return <ErrorCard entry={entry} />;
  if (entry.type === 'thinking') {
    if (hideVerbose) return null;
    return <ProseCard entry={entry} category="planning" italic />;
  }
  if (entry.type === 'text') {
    return <ProseCard entry={entry} category="agent" />;
  }
  if (entry.type === 'tool_call') {
    if (!entry.args || Object.keys(entry.args).length === 0) return null;
    return <SingleToolCallCard entry={entry} />;
  }
  if (entry.type === 'tool_result') {
    return <ToolResultCard entry={entry} hideVerbose={hideVerbose} />;
  }

  return null;
}
