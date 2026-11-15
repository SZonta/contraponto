export type AgentId = 'claude' | 'codex';

/** What the chat selector picks: one agent, or Claude leading and delegating to Codex. */
export type AgentMode = AgentId | 'auto';

/** ask = every action needs approval; acceptEdits = file edits run freely; full = nothing asks. */
export type PermissionLevel = 'ask' | 'acceptEdits' | 'full';

export type Project = { id: string; path: string; name: string; createdAt: number };

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

/** Events the main process pushes to the renderer. */
export type UiEvent =
  | { type: 'textDelta'; chatId: string; agent: AgentId; text: string }
  | { type: 'entry'; entry: StoredEntry }
  | { type: 'entryUpdated'; entry: StoredEntry }
  | { type: 'chatUpdated'; chat: Chat }
  | { type: 'approval'; request: ApprovalRequest }
  | { type: 'approvalResolved'; id: string }
  | { type: 'turnState'; chatId: string; running: boolean }
  | { type: 'usage'; usage: AgentUsage };

/** API exposed by the preload script as window.contraponto. */
export interface ContrapontoApi {
  listProjects(): Promise<Project[]>;
  addProject(): Promise<Project | null>;
  listChats(projectId: string): Promise<Chat[]>;
  createChat(projectId: string): Promise<Chat>;
  updateChat(chatId: string, settings: ChatSettings): Promise<Chat>;
  deleteChat(chatId: string): Promise<void>;
  listEntries(chatId: string): Promise<StoredEntry[]>;
  sendMessage(chatId: string, text: string, attachments: Attachment[]): Promise<void>;
  interrupt(chatId: string): Promise<void>;
  pickAttachments(): Promise<Attachment[]>;
  attachFile(file: File): Promise<Attachment>;
  saveAttachment(name: string, mimeType: string, bytes: Uint8Array): Promise<Attachment>;
  resolveApproval(id: string, decision: ApprovalDecision): Promise<void>;
  listPendingApprovals(): Promise<ApprovalRequest[]>;
  runningChats(): Promise<string[]>;
  listModels(agent: AgentId): Promise<ModelOption[]>;
  getUsage(): Promise<AgentUsage[]>;
  getSettings(): Promise<AppSettings>;
  updateSettings(settings: AppSettings): Promise<AppSettings>;
  /** Restores the files changed by the turn that ended with this entry. */
  undoTurn(entryId: string): Promise<void>;
  onEvent(listener: (event: UiEvent) => void): () => void;
}
