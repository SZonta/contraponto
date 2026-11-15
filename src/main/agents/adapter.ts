import type {
  AgentId,
  AgentUsage,
  ApprovalDecision,
  ApprovalKind,
  Attachment,
  ModelOption,
  PermissionLevel,
} from '@shared/types';

/** What every agent reports during a turn, independent of its native protocol. */
export type AdapterEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'textDelta'; text: string }
  | { type: 'message'; text: string }
  | { type: 'toolStarted'; toolId: string; name: string; detail: string }
  | { type: 'toolCompleted'; toolId: string; status: 'done' | 'failed'; output?: string }
  | { type: 'fileChange'; paths: string[]; diff?: string }
  | { type: 'image'; path: string; prompt?: string }
  | { type: 'usage'; usage: Omit<AgentUsage, 'agent'> }
  | { type: 'error'; message: string }
  | { type: 'turnCompleted'; status: string };

export type TurnInput = {
  chatId: string;
  cwd: string;
  text: string;
  attachments: Attachment[];
  /** Claude session id or Codex thread id from a previous turn. */
  sessionId: string | null;
  model: string | null;
  effort: string | null;
  permission: PermissionLevel;
};

export type ApprovalPrompt = { kind: ApprovalKind; title: string; detail: string };

export type TurnSink = {
  emit(event: AdapterEvent): void;
  approve(prompt: ApprovalPrompt): Promise<ApprovalDecision>;
};

export interface AgentAdapter {
  readonly agent: AgentId;
  /** Resolves when the turn ends, successfully or not. */
  sendTurn(input: TurnInput, sink: TurnSink): Promise<void>;
  interrupt(chatId: string): Promise<void>;
  listModels(): Promise<ModelOption[]>;
  /** Current plan usage, when the agent can report it without spending tokens. */
  readUsage(): Promise<Omit<AgentUsage, 'agent'> | null>;
  dispose(): void;
}

export function truncate(text: string, max = 4000): string {
  return text.length > max ? `${text.slice(0, max)}\n…` : text;
}
