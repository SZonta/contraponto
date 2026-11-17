export type AgentId = 'claude' | 'codex';

/** What the chat selector picks: one agent, or Claude leading and delegating to Codex. */
export type AgentMode = AgentId | 'auto';

/** ask = every action needs approval; acceptEdits = routine edits and commands run freely, risky ones ask; full = nothing asks. */
export type PermissionLevel = 'ask' | 'acceptEdits' | 'full';

/** scratch = the private folder of a chat started without a folder. */
export type Project = { id: string; path: string; name: string; scratch: boolean; createdAt: number };

export type Chat = {
  id: string;
  projectId: string;
  title: string;
  agent: AgentMode;
  claudeSessionId: string | null;
  codexThreadId: string | null;
  claudeModel: string | null;
  claudeEffort: string | null;
  codexModel: string | null;
  codexEffort: string | null;
  permissionLevel: PermissionLevel;
  createdAt: number;
  updatedAt: number;
};

/** Fields the renderer may change on a chat. */
export type ChatSettings = Partial<
  Pick<Chat, 'title' | 'agent' | 'claudeModel' | 'claudeEffort' | 'codexModel' | 'codexEffort' | 'permissionLevel'>
>;

export type Attachment = { name: string; path: string; mimeType: string };

export type ChatEntry =
  | { kind: 'user'; text: string; attachments: Attachment[] }
  | { kind: 'assistant'; agent: AgentId; text: string }
  | { kind: 'tool'; agent: AgentId; toolId: string; name: string; detail: string; status: 'running' | 'done' | 'failed'; output?: string }
  | { kind: 'fileChange'; agent: AgentId; paths: string[]; diff?: string }
  | { kind: 'image'; agent: AgentId; path: string; prompt?: string }
  | { kind: 'error'; agent: AgentId; message: string }
  | { kind: 'notice'; text: string }
  | {
      kind: 'turnEnd';
      agent: AgentId;
      status: string;
      /** Files changed during the turn, from the checkpoint diff; set for turns that can be undone. */
      files?: string[];
      timelineId?: string;
      undone?: boolean;
    };

export type StoredEntry = ChatEntry & { id: string; chatId: string; createdAt: number };

/** resetsAt is a Unix timestamp in milliseconds. */
export type UsageWindow = { usedPercent: number; resetsAt: number | null };

export type AgentUsage = { agent: AgentId; fiveHour: UsageWindow | null; week: UsageWindow | null; observedAt: number };

export type ModelOption = { id: string; label: string; efforts: string[]; defaultEffort: string | null; isDefault: boolean };

export type ApprovalKind = 'command' | 'file' | 'tool';

export type ApprovalRequest = { id: string; chatId: string; agent: AgentId; kind: ApprovalKind; title: string; detail: string };

export type ApprovalDecision = 'allow' | 'allowSession' | 'deny';

/** One row of the "who does what" table used by the automatic mode. */
export type RoutingRule = { taskType: string; agent: AgentId };

export type AppSettings = {
  routingRules: RoutingRule[];
  /** In automatic mode, hand work to the other agent when one passes `threshold` percent of a window. */
  quotaSwitch: { enabled: boolean; threshold: number };
};

export type ScheduleTrigger =
  | { kind: 'cron'; expression: string; timezone: string }
  | { kind: 'interval'; minutes: number }
  | { kind: 'once'; at: number };

export type ScheduleInput = {
  name: string;
  projectId: string;
  trigger: ScheduleTrigger;
  prompt: string;
  continueChat: boolean;
  chatId: string | null;
  settings: Required<Pick<ChatSettings, 'agent' | 'claudeModel' | 'claudeEffort' | 'codexModel' | 'codexEffort' | 'permissionLevel'>>;
};

export type Schedule = ScheduleInput & {
  id: string;
  enabled: boolean;
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastChatId: string | null;
  lastStatus: 'idle' | 'running' | 'completed' | 'failed' | 'interrupted';
  lastError: string | null;
};

/** Events the main process pushes to the renderer. */
export type UiEvent =
  | { type: 'textDelta'; chatId: string; agent: AgentId; text: string }
  | { type: 'entry'; entry: StoredEntry }
  | { type: 'entryUpdated'; entry: StoredEntry }
  | { type: 'chatUpdated'; chat: Chat }
  | { type: 'approval'; request: ApprovalRequest }
  | { type: 'approvalResolved'; id: string }
  | { type: 'turnState'; chatId: string; running: boolean }
  /** Work still going on after the turn ended (background shells, subagents, the agent resuming on its own); empty when done. */
  | { type: 'background'; chatId: string; tasks: string[] }
  | { type: 'usage'; usage: AgentUsage }
  | { type: 'schedulesChanged' };

/** API exposed by the preload script as window.contraponto. */
export interface ContrapontoApi {
  listProjects(): Promise<Project[]>;
  /** Every chat when no project is given. */
  listChats(projectId?: string): Promise<Chat[]>;
  /** Without a project, the chat gets its own private folder. */
  createChat(projectId?: string): Promise<Chat>;
  /** Asks for a folder and moves the chat there; only before its first message. Null when cancelled. */
  chooseChatFolder(chatId: string): Promise<Chat | null>;
  updateChat(chatId: string, settings: ChatSettings): Promise<Chat>;
  deleteChat(chatId: string): Promise<void>;
  /** Deletes the chat only if nothing was ever sent in it. True when it was deleted. */
  discardEmptyChat(chatId: string): Promise<boolean>;
  listEntries(chatId: string): Promise<StoredEntry[]>;
  sendMessage(chatId: string, text: string, attachments: Attachment[]): Promise<void>;
  interrupt(chatId: string): Promise<void>;
  pickAttachments(): Promise<Attachment[]>;
  attachFile(file: File): Promise<Attachment>;
  saveAttachment(name: string, mimeType: string, bytes: Uint8Array): Promise<Attachment>;
  resolveApproval(id: string, decision: ApprovalDecision): Promise<void>;
  listPendingApprovals(): Promise<ApprovalRequest[]>;
  runningChats(): Promise<string[]>;
  /** Background work per chat id, for chats that have any. */
  backgroundTasks(): Promise<Record<string, string[]>>;
  listModels(agent: AgentId): Promise<ModelOption[]>;
  getUsage(): Promise<AgentUsage[]>;
  getSettings(): Promise<AppSettings>;
  updateSettings(settings: AppSettings): Promise<AppSettings>;
  /** Restores the files changed by the turn that ended with this entry. */
  undoTurn(entryId: string): Promise<void>;
  listSchedules(): Promise<Schedule[]>;
  saveSchedule(input: ScheduleInput, id?: string): Promise<Schedule>;
  pauseSchedule(id: string, paused: boolean): Promise<Schedule>;
  deleteSchedule(id: string): Promise<void>;
  getDesktopSettings(): Promise<{ startWithWindows: boolean; packaged: boolean }>;
  setStartWithWindows(enabled: boolean): Promise<boolean>;
  onEvent(listener: (event: UiEvent) => void): () => void;
}
