import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { groupToolPairs, isVerboseItem, matchesFilter } from './groupToolPairs';
import { GenerationLogEntryRow } from './GenerationLogEntry';
import type { GenerationLogEntry, LogFilter } from './types';
import { useGenerationLogScroll } from './useGenerationLogScroll';

interface GenerationLogPanelProps {
  logs: GenerationLogEntry[];
  autoScroll?: boolean;
  headerExtra?: ReactNode;
  footer?: ReactNode;
  className?: string;
  defaultHideVerbose?: boolean;
  showFilters?: boolean;
}

const FILTERS: { id: LogFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'status', label: 'Status' },
  { id: 'actions', label: 'Actions' },
  { id: 'agent', label: 'Agent' },
];

export function GenerationLogPanel({
  logs,
  autoScroll = true,
  headerExtra,
  footer,
  className = '',
  defaultHideVerbose = false,
  showFilters = true,
}: GenerationLogPanelProps) {
  const [filter, setFilter] = useState<LogFilter>('all');
  const [hideVerbose, setHideVerbose] = useState(defaultHideVerbose);

  useEffect(() => {
    if (defaultHideVerbose) return;
    const mq = window.matchMedia('(max-width: 639px)');
    if (mq.matches) setHideVerbose(true);
  }, [defaultHideVerbose]);

  const grouped = useMemo(() => groupToolPairs(logs), [logs]);

  const visibleItems = useMemo(
    () =>
      grouped.filter((item) => {
        if (hideVerbose && isVerboseItem(item)) return false;
        return matchesFilter(item, filter);
      }),
    [grouped, filter, hideVerbose]
  );

  const { scrollRef, isScrolledToBottom, handleScroll, scrollToBottom } =
    useGenerationLogScroll({
      logCount: visibleItems.length,
      autoScroll,
    });

  return (
    <div
      data-testid="generation-log-panel"
      className={`flex flex-col min-h-0 flex-1 ${className}`}
    >
      <div className="h-10 sm:h-12 border-b border-white/5 flex items-center px-3 sm:px-4 bg-white/[0.02] shrink-0 justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="hidden sm:flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
            <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
            <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
          </div>
          <span className="font-mono text-[10px] text-white/30 uppercase tracking-widest font-bold truncate">
            Process Log
          </span>
        </div>
        {headerExtra}
      </div>

      {showFilters ? (
        <div
          data-testid="generation-log-filters"
          className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2 border-b border-white/5 bg-white/[0.01] shrink-0"
        >
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              data-testid={`log-filter-${id}`}
              onClick={() => setFilter(id)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                filter === id
                  ? 'bg-white/15 text-white border border-white/15'
                  : 'bg-transparent text-white/40 hover:text-white/65 border border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            data-testid="log-filter-hide-verbose"
            onClick={() => setHideVerbose((v) => !v)}
            className={`ml-auto px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
              hideVerbose
                ? 'bg-violet-500/15 text-violet-300 border border-violet-500/25'
                : 'bg-transparent text-white/40 hover:text-white/65 border border-white/10'
            }`}
          >
            {hideVerbose ? 'Verbose hidden' : 'Hide verbose'}
          </button>
        </div>
      ) : null}

      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          data-testid="generation-log-scroll"
          className="absolute inset-0 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4 overscroll-contain"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <AnimatePresence initial={false}>
            {visibleItems.map((item) => (
              <GenerationLogEntryRow
                key={item.kind === 'action_group' ? item.id : item.entry.id}
                item={item}
                hideVerbose={hideVerbose}
              />
            ))}
          </AnimatePresence>
          {footer}
        </div>

        {!isScrolledToBottom ? (
          <>
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-16 log-scroll-fade"
              aria-hidden
            />
            <button
              type="button"
              data-testid="log-jump-to-latest"
              onClick={scrollToBottom}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-white/80 text-[10px] font-bold uppercase tracking-widest backdrop-blur-md transition-colors cursor-pointer shadow-lg"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              Jump to latest
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
