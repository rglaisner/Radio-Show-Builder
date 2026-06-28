import type { DisplayLogItem, GenerationLogEntry } from './types';

function isEmptyToolCall(entry: GenerationLogEntry): boolean {
  return (
    entry.type === 'tool_call' &&
    (!entry.args || Object.keys(entry.args).length === 0)
  );
}

function canGroup(call: GenerationLogEntry, result: GenerationLogEntry): boolean {
  if (call.type !== 'tool_call' || result.type !== 'tool_result') return false;
  if (result.name && call.name && result.name !== call.name) return false;
  return true;
}

export function groupToolPairs(logs: GenerationLogEntry[]): DisplayLogItem[] {
  const items: DisplayLogItem[] = [];
  const consumed = new Set<number>();

  for (let i = 0; i < logs.length; i++) {
    if (consumed.has(i)) continue;

    const entry = logs[i];
    if (isEmptyToolCall(entry)) continue;

    if (entry.type === 'tool_call') {
      const next = logs[i + 1];
      if (next && !consumed.has(i + 1) && canGroup(entry, next)) {
        consumed.add(i + 1);
        items.push({
          kind: 'action_group',
          id: entry.id,
          timestamp: entry.timestamp,
          call: entry,
          result: next,
        });
        continue;
      }
    }

    items.push({ kind: 'single', entry });
  }

  return items;
}

export function matchesFilter(
  item: DisplayLogItem,
  filter: 'all' | 'status' | 'actions' | 'agent'
): boolean {
  if (filter === 'all') return true;

  if (item.kind === 'action_group') {
    return filter === 'actions';
  }

  const { type } = item.entry;
  if (filter === 'status') return type === 'info' || type === 'error';
  if (filter === 'actions') return type === 'tool_call' || type === 'tool_result';
  if (filter === 'agent') return type === 'thinking' || type === 'text';
  return true;
}

export function isVerboseItem(item: DisplayLogItem): boolean {
  if (item.kind === 'action_group') return false;
  return item.entry.type === 'thinking';
}
