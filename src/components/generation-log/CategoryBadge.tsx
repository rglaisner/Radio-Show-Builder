import type { LogCategory } from './types';

const CATEGORY_STYLES: Record<
  LogCategory,
  { label: string; className: string }
> = {
  status: {
    label: 'Status',
    className: 'bg-white/8 text-white/55 border-white/10',
  },
  planning: {
    label: 'Planning',
    className: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  },
  agent: {
    label: 'Agent',
    className: 'bg-io-blue/15 text-io-blue border-io-blue/25',
  },
  command: {
    label: 'Command',
    className: 'bg-io-blue/15 text-io-blue border-io-blue/25',
  },
  file: {
    label: 'File',
    className: 'bg-io-yellow/10 text-io-yellow border-io-yellow/20',
  },
  output: {
    label: 'Output',
    className: 'bg-io-green/10 text-io-green border-io-green/25',
  },
  error: {
    label: 'Error',
    className: 'bg-red-500/15 text-red-300 border-red-500/25',
  },
  action: {
    label: 'Action',
    className: 'bg-io-blue/15 text-io-blue border-io-blue/25',
  },
};

interface CategoryBadgeProps {
  category: LogCategory;
}

export function CategoryBadge({ category }: CategoryBadgeProps) {
  const style = CATEGORY_STYLES[category];
  return (
    <span
      data-testid={`log-badge-${category}`}
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${style.className}`}
    >
      {style.label}
    </span>
  );
}
