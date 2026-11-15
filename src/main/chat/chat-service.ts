import { randomUUID } from 'node:crypto';
import type { AgentId, ApprovalDecision, ApprovalRequest, Attachment, StoredEntry, UiEvent } from '@shared/types';
import type { AdapterEvent, AgentAdapter, ApprovalPrompt } from '../agents/adapter';
import type { Store } from '../storage/store';
import type { UsageService } from '../usage/usage-service';

type PendingApproval = { request: ApprovalRequest; resolve: (decision: ApprovalDecision) => void };

const DEFAULT_TITLE = 'Novo chat';

/** Runs turns: persists what the agents report and forwards it to the window. */
export class ChatService {
  private readonly running = new Set<string>();
  private readonly approvals = new Map<string, PendingApproval>();

  constructor(
    private readonly store: Store,
    private readonly adapters: Record<AgentId, AgentAdapter>,
    private readonly usage: UsageService,
    private readonly emit: (event: UiEvent) => void,
  ) {}

  runningChats(): string[] {
    return [...this.running];
  }

  pendingApprovals(): ApprovalRequest[] {
    return [...this.approvals.values()].map((pending) => pending.request);
  }

  /** Starts the turn and returns at once; progress arrives as events. */
  send(chatId: string, text: string, attachments: Attachment[]): void {
    if (this.running.has(chatId)) throw new Error('Este chat ainda está respondendo.');
    const chat = this.store.getChat(chatId);
    if (!chat) throw new Error('Chat não encontrado.');
    const project = this.store.getProject(chat.projectId);
    if (!project) throw new Error('Pasta do projeto não encontrada.');

    this.addEntry(chatId, { kind: 'user', text, attachments });
    if (chat.title === DEFAULT_TITLE && text.trim()) {
      const title = text.trim().replace(/\s+/g, ' ').slice(0, 48);
      this.emit({ type: 'chatUpdated', chat: this.store.updateChat(chatId, { title }) });
    }

    this.running.add(chatId);
    this.emit({ type: 'turnState', chatId, running: true });
    void this.runTurn(chatId, chat.agent, project.path, text, attachments);
  }

  async interrupt(chatId: string): Promise<void> {
    const chat = this.store.getChat(chatId);
    if (chat) await this.adapters[chat.agent].interrupt(chatId);
  }

  resolveApproval(id: string, decision: ApprovalDecision): void {
    const pending = this.approvals.get(id);
    if (!pending) return;
    this.approvals.delete(id);
    pending.resolve(decision);
    this.emit({ type: 'approvalResolved', id });
  }

  private async runTurn(chatId: string, agent: AgentId, cwd: string, text: string, attachments: Attachment[]): Promise<void> {
    const chat = this.store.getChat(chatId)!;
    const tools = new Map<string, StoredEntry>();
    const isClaude = agent === 'claude';

    try {
      await this.adapters[agent].sendTurn(
        {
          chatId,
          cwd,
          text,
          attachments,
          sessionId: isClaude ? chat.claudeSessionId : chat.codexThreadId,
          model: isClaude ? chat.claudeModel : chat.codexModel,
          effort: isClaude ? chat.claudeEffort : chat.codexEffort,
          permission: chat.permissionLevel,
        },
        {
          emit: (event) => this.handle(chatId, agent, event, tools),
          approve: (prompt) => this.askApproval(chatId, agent, prompt),
        },
      );
    } catch (error) {
      this.addEntry(chatId, { kind: 'error', agent, message: error instanceof Error ? error.message : String(error) });
    } finally {
      for (const [id, pending] of this.approvals) {
        if (pending.request.chatId === chatId) this.resolveApproval(id, 'deny');
      }
      this.running.delete(chatId);
      this.emit({ type: 'turnState', chatId, running: false });
    }
  }

  private handle(chatId: string, agent: AgentId, event: AdapterEvent, tools: Map<string, StoredEntry>): void {
    switch (event.type) {
      case 'session': {
        const field = agent === 'claude' ? { claudeSessionId: event.sessionId } : { codexThreadId: event.sessionId };
        this.emit({ type: 'chatUpdated', chat: this.store.updateChat(chatId, field) });
        break;
      }
      case 'textDelta':
        this.emit({ type: 'textDelta', chatId, agent, text: event.text });
        break;
      case 'message':
        this.addEntry(chatId, { kind: 'assistant', agent, text: event.text });
        break;
      case 'toolStarted':
        tools.set(
          event.toolId,
          this.addEntry(chatId, { kind: 'tool', agent, toolId: event.toolId, name: event.name, detail: event.detail, status: 'running' }),
        );
        break;
      case 'toolCompleted': {
        const entry = tools.get(event.toolId);
        if (entry?.kind !== 'tool') break;
        const updated: StoredEntry = { ...entry, status: event.status, output: event.output };
        tools.set(event.toolId, updated);
        this.store.updateEntry(updated);
        this.emit({ type: 'entryUpdated', entry: updated });
        break;
      }
      case 'fileChange':
        this.addEntry(chatId, { kind: 'fileChange', agent, paths: event.paths, diff: event.diff });
        break;
      case 'image':
        this.addEntry(chatId, { kind: 'image', agent, path: event.path, prompt: event.prompt });
        break;
      case 'usage':
        this.usage.update(agent, event.usage);
        break;
      case 'error':
        this.addEntry(chatId, { kind: 'error', agent, message: event.message });
        break;
      case 'turnCompleted':
        this.addEntry(chatId, { kind: 'turnEnd', agent, status: event.status });
        break;
    }
  }

  private askApproval(chatId: string, agent: AgentId, prompt: ApprovalPrompt): Promise<ApprovalDecision> {
    const request: ApprovalRequest = { id: randomUUID(), chatId, agent, ...prompt };
    return new Promise((resolve) => {
      this.approvals.set(request.id, { request, resolve });
      this.emit({ type: 'approval', request });
    });
  }

  private addEntry(chatId: string, entry: Parameters<Store['addEntry']>[1]): StoredEntry {
    const stored = this.store.addEntry(chatId, entry);
    this.emit({ type: 'entry', entry: stored });
    return stored;
  }
}
