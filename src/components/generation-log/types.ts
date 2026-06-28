export type GenerationLogType =
  | 'info'
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'text'
  | 'error';

export interface GenerationLogEntry {
  id: string;
  timestamp: string;
  type: GenerationLogType;
  content?: string;
  name?: string;
  args?: Record<string, unknown>;
  result?: string;
}

export type LogFilter = 'all' | 'status' | 'actions' | 'agent';

export interface ActionGroupItem {
  kind: 'action_group';
  id: string;
  timestamp: string;
  call: GenerationLogEntry;
  result?: GenerationLogEntry;
}

export interface SingleLogItem {
  kind: 'single';
  entry: GenerationLogEntry;
}

export type DisplayLogItem = ActionGroupItem | SingleLogItem;

export type LogCategory =
  | 'status'
  | 'planning'
  | 'agent'
  | 'command'
  | 'file'
  | 'output'
  | 'error'
  | 'action';
