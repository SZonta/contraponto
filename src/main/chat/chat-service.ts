import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { normalizeChatTitle } from '@shared/chat-title';
import type { AgentId, ApprovalDecision, ApprovalRequest, Attachment, Chat, ChatSettings, Project, StoredEntry, UiEvent } from '@shared/types';
import type { AdapterEvent, AgentAdapter, ApprovalPrompt, TurnInput } from '../agents/adapter';
import {
  CODEX_TEAM_NOTE,
  IMAGE_DISPLAY_NOTE,
  blenderInstructions,
  globalRulesForCodex,
  joinInstructions,
  projectRulesForClaude,
  workFilesNote,
} from '../orchestrator/instructions';
import { decideRoute, routingInstructions } from '../orchestrator/routing';
import type { SettingsService } from '../orchestrator/settings-service';
import type { Store } from '../storage/store';
import type { UsageService } from '../usage/usage-service';

type PendingApproval = { request: ApprovalRequest; resolve: (decision: ApprovalDecision) => void };

/** A turn recorded in the timeline, with what it cost in checkpoints. */
type FinishedTurn = {
  id: string;
  files: string[];
  /** Files over the size limit, which undo cannot restore. */
  skipped?: string[];
  added?: { bytes: number; largest: { path: string; bytes: number }[] };
};

const HEAVY_TURN_BYTES = 200 * 1024 * 1024;

function megabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** Checkpoints and timeline of a project (implemented by Timeline). */
export interface TurnContext {
  begin(project: Project): Promise<string>;
  crossSummary(project: Project, agent: AgentId, beforeRef: string, includeOutside?: boolean): Promise<string | null>;
  finish(
    project: Project,
    turn: { chatId: string; agent: AgentId; prompt: string; result: string; beforeRef: string },
  ): Promise<FinishedTurn>;
  undo(project: Project, timelineId: string): Promise<string[]>;
}

/** What one agent reported during a turn. */
type TurnState = { tools: Map<string, StoredEntry>; lastMessage: string; status: string; images: string[] };

const DEFAULT_TITLE = 'Novo chat';

function newState(): TurnState {
  return { tools: new Map(), lastMessage: '', status: 'completed', images: [] };
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Runs turns: routes, keeps the timeline, persists what the agents report and forwards it to the window. */
export class ChatService {
  private readonly running = new Set<string>();
  /** Work still going on per chat after its turn ended. */
  private readonly background = new Map<string, string[]>();
  private readonly approvals = new Map<string, PendingApproval>();
  /** One turn at a time per project folder; later turns wait their turn. */
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly store: Store,
    private readonly adapters: Record<AgentId, AgentAdapter>,
    private readonly usage: UsageService,
    private readonly settings: SettingsService,
    private readonly context: TurnContext,
    private readonly emit: (event: UiEvent) => void,
    private readonly files?: { previewScript: string; foldersFor: (chatId: string) => { previews: string; tmp: string } },
    private readonly generateTitle?: (text: string, agent: AgentId) => Promise<string | null>,
  ) {}

  /** Where this chat's previews and temporary work go; both folders are removed with the chat. */
  private fileNotes(chatId: string): string | undefined {
    if (!this.files) return undefined;
    const folders = this.files.foldersFor(chatId);
    mkdirSync(folders.previews, { recursive: true });
    mkdirSync(folders.tmp, { recursive: true });
    return joinInstructions(workFilesNote(folders.tmp), blenderInstructions(this.files.previewScript, folders.previews));
  }

  runningChats(): string[] {
    return [...this.running];
  }

  backgroundTasks(): Record<string, string[]> {
    return Object.fromEntries(this.background);
  }

  pendingApprovals(): ApprovalRequest[] {
    return [...this.approvals.values()].map((pending) => pending.request);
  }

  /** Starts the turn and returns at once; progress arrives as events. */
  send(chatId: string, text: string, attachments: Attachment[]): void {
    void this.enqueue(chatId, text, attachments).catch((error: unknown) => console.error('[chat]', error));
  }

  /** Scheduled turns use the same folder queue and settle only after checkpoints finish. */
  async sendAndWait(chatId: string, text: string, settings: ChatSettings): Promise<string> {
    while (this.running.has(chatId)) {
      const chat = this.store.getChat(chatId);
      const turn = chat && this.locks.get(chat.projectId);
      if (!turn) throw new Error('O chat em execução não está mais disponível.');
      await turn.catch(() => {});
    }
    return this.enqueue(chatId, text, [], settings);
  }

  private enqueue(chatId: string, text: string, attachments: Attachment[], settings?: ChatSettings): Promise<string> {
    if (this.running.has(chatId)) throw new Error('Este chat ainda está respondendo.');
    const chat = this.store.getChat(chatId);
    if (!chat) throw new Error('Chat não encontrado.');
    const project = this.store.getProject(chat.projectId);
    if (!project) throw new Error('Pasta do projeto não encontrada.');

    const needsTitle = chat.title === DEFAULT_TITLE && text.trim() && !this.store.listEntries(chatId).some((entry) => entry.kind === 'user');
    this.addEntry(chatId, { kind: 'user', text, attachments });

    this.running.add(chatId);
    this.emit({ type: 'turnState', chatId, running: true });
    if (needsTitle && this.generateTitle) {
      const route = decideRoute(chat.agent, text, this.usage.list(), this.settings.get());
      void this.nameChat(chatId, text, route.agent);
    }
    const previous = this.locks.get(project.id);
    if (previous) this.addEntry(chatId, { kind: 'notice', text: 'Outra conversa está trabalhando nesta pasta. Esta mensagem roda quando ela terminar.' });
    const turn = (previous ?? Promise.resolve()).catch(() => {}).then(() => this.runTurn(chatId, text, attachments, settings));
    this.locks.set(project.id, turn);
    void turn.finally(() => {
      if (this.locks.get(project.id) === turn) this.locks.delete(project.id);
    }).catch(() => {});
    return turn;
  }

  private async nameChat(chatId: string, text: string, agent: AgentId): Promise<void> {
    try {
      const title = normalizeChatTitle(await this.generateTitle!(text, agent));
      if (title && this.store.getChat(chatId)?.title === DEFAULT_TITLE) {
        this.emit({ type: 'chatUpdated', chat: this.store.updateChat(chatId, { title }) });
      }
    } catch (error) {
      console.error('[chat-title]', error);
    }
  }

  async interrupt(chatId: string): Promise<void> {
    await Promise.all(Object.values(this.adapters).map((adapter) => adapter.interrupt(chatId)));
  }

  resolveApproval(id: string, decision: ApprovalDecision): void {
    const pending = this.approvals.get(id);
    if (!pending) return;
    this.approvals.delete(id);
    pending.resolve(decision);
    this.emit({ type: 'approvalResolved', id });
  }

  async undoTurn(entryId: string): Promise<void> {
    const entry = this.store.getEntry(entryId);
    if (entry?.kind !== 'turnEnd' || !entry.timelineId) throw new Error('Este turno não pode ser desfeito.');
    const project = this.store.getProject(this.store.getChat(entry.chatId)!.projectId)!;
    if (this.locks.has(project.id)) throw new Error('Espere a IA terminar antes de desfazer.');
    const restored = await this.context.undo(project, entry.timelineId);
    const updated: StoredEntry = { ...entry, undone: true };
    this.store.updateEntry(updated);
    this.emit({ type: 'entryUpdated', entry: updated });
    this.addEntry(entry.chatId, {
      kind: 'notice',
      text: restored.length ? `Turno desfeito. Arquivos restaurados: ${restored.join(', ')}` : 'Turno desfeito. Nenhum arquivo precisou ser restaurado.',
    });
  }

  private async runTurn(chatId: string, text: string, attachments: Attachment[], settingsOverride?: ChatSettings): Promise<string> {
    const chat = settingsOverride ? this.store.updateChat(chatId, settingsOverride) : this.store.getChat(chatId)!;
    if (settingsOverride) this.emit({ type: 'chatUpdated', chat });
    const project = this.store.getProject(chat.projectId)!;
    const settings = this.settings.get();
    const route = decideRoute(chat.agent, text, this.usage.list(), settings);
    const state = newState();
    let beforeRef: string | null = null;

    try {
      if (route.notice) this.addEntry(chatId, { kind: 'notice', text: route.notice });
      beforeRef = await this.context.begin(project);
      const summary = await this.context.crossSummary(project, route.agent, beforeRef);
      const instructions =
        route.agent === 'claude'
          ? joinInstructions(
              projectRulesForClaude(project.path),
              route.delegate ? routingInstructions(settings.routingRules) : null,
              IMAGE_DISPLAY_NOTE,
              this.fileNotes(chatId),
            )
          : joinInstructions(globalRulesForCodex(), CODEX_TEAM_NOTE, IMAGE_DISPLAY_NOTE,
              this.fileNotes(chatId));
      await this.adapters[route.agent].sendTurn(
        {
          ...this.agentSettings(chat, route.agent),
          chatId,
          cwd: project.path,
          text: summary ? `${summary}\n\n${text}` : text,
          attachments,
          instructions,
          delegate: route.delegate
            ? (task, expected) => this.delegateToCodex(chatId, project, route.codexBlocked, task, expected)
            : undefined,
        },
        {
          emit: (event) => this.handle(chatId, route.agent, event, state),
          approve: (prompt) => this.askApproval(chatId, route.agent, prompt),
        },
      );
    } catch (error) {
      state.status = 'failed';
      this.addEntry(chatId, { kind: 'error', agent: route.agent, message: error instanceof Error ? error.message : String(error) });
    } finally {
      for (const [id, pending] of this.approvals) {
        if (pending.request.chatId === chatId) this.resolveApproval(id, 'deny');
      }
      await this.closeTurn(chatId, project, route.agent, text, state, beforeRef);
      this.running.delete(chatId);
      this.emit({ type: 'turnState', chatId, running: false });
    }
    return state.status;
  }

  private async closeTurn(chatId: string, project: Project, agent: AgentId, prompt: string, state: TurnState, beforeRef: string | null) {
    let timeline: { id: string; files: string[] } | null = null;
    if (beforeRef) {
      try {
        const finished = await this.context.finish(project, { chatId, agent, prompt, result: state.lastMessage, beforeRef });
        this.noteStorage(chatId, finished);
        timeline = finished;
      } catch (error) {
        this.addEntry(chatId, { kind: 'error', agent, message: `Não consegui registrar o checkpoint: ${error instanceof Error ? error.message : String(error)}` });
      }
    }
    this.addEntry(chatId, { kind: 'turnEnd', agent, status: state.status, files: timeline?.files, timelineId: timeline?.id });
  }

  /** Tells the user, at the turn that did it, which big files undo cannot restore and what the turn cost. */
  private noteStorage(chatId: string, { skipped, added }: Pick<FinishedTurn, 'skipped' | 'added'>) {
    if (skipped?.length) {
      const names = skipped.length > 5 ? `${skipped.slice(0, 5).join(', ')} e mais ${skipped.length - 5}` : skipped.join(', ');
      this.addEntry(chatId, { kind: 'notice', text: `Acima de 100 MB, fora do checkpoint (Desfazer não restaura): ${names}` });
    }
    // A turn that adds this much to the checkpoints is worth seeing as it happens.
    if (added && added.bytes > HEAVY_TURN_BYTES) {
      const largest = added.largest.filter((file) => file.bytes > 0).map((file) => `${file.path} (${megabytes(file.bytes)})`).join(', ');
      this.addEntry(chatId, { kind: 'notice', text: `Este turno somou ${megabytes(added.bytes)} aos checkpoints.${largest ? ` Maiores arquivos: ${largest}.` : ''}` });
    }
  }

  /** Runs a Codex turn inside a Claude turn; its progress shows in the same chat. */
  private async delegateToCodex(chatId: string, project: Project, blocked: boolean, task: string, expected: string): Promise<string> {
    if (blocked) {
      this.addEntry(chatId, { kind: 'notice', text: 'O Codex passou do limite de uso configurado; o Claude fará esta parte.' });
      return 'Codex indisponível: passou do limite de uso configurado pelo usuário. Faça esta parte você mesmo.';
    }
    const chat = this.store.getChat(chatId)!;
    const state = newState();
    try {
      const beforeRef = await this.context.begin(project);
      // Claude's own work in this turn is not done yet, so it must not show up as an outside change.
      const summary = await this.context.crossSummary(project, 'codex', beforeRef, false);
      const brief = `[Tarefa delegada pelo Claude]\n${task}\n\nResultado esperado: ${expected}`;
      await this.adapters.codex.sendTurn(
        {
          ...this.agentSettings(chat, 'codex'),
          chatId,
          cwd: project.path,
          text: summary ? `${summary}\n\n${brief}` : brief,
          attachments: [],
          instructions: joinInstructions(globalRulesForCodex(), CODEX_TEAM_NOTE, IMAGE_DISPLAY_NOTE,
            this.fileNotes(chatId)),
        },
        {
          emit: (event) => this.handle(chatId, 'codex', event, state),
          approve: (prompt) => this.askApproval(chatId, 'codex', prompt),
        },
      );
      const timeline = await this.context.finish(project, { chatId, agent: 'codex', prompt: task, result: state.lastMessage, beforeRef });
      this.noteStorage(chatId, timeline);
      return [
        `Codex terminou (${state.status}).`,
        `Resposta do Codex: ${state.lastMessage || '(sem texto)'}`,
        `Arquivos alterados: ${timeline.files.join(', ') || 'nenhum'}`,
        state.images.length ? `Imagens geradas: ${state.images.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    } catch (error) {
      return `O Codex falhou: ${error instanceof Error ? error.message : String(error)}. Faça esta parte você mesmo ou explique o problema ao usuário.`;
    }
  }

  private agentSettings(chat: Chat, agent: AgentId): Pick<TurnInput, 'sessionId' | 'model' | 'effort' | 'permission'> {
    const isClaude = agent === 'claude';
    return {
      sessionId: isClaude ? chat.claudeSessionId : chat.codexThreadId,
      model: isClaude ? chat.claudeModel : chat.codexModel,
      effort: isClaude ? chat.claudeEffort : chat.codexEffort,
      permission: chat.permissionLevel,
    };
  }

  private handle(chatId: string, agent: AgentId, event: AdapterEvent, state: TurnState): void {
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
        state.lastMessage = event.text;
        this.addEntry(chatId, { kind: 'assistant', agent, text: event.text });
        break;
      case 'toolStarted':
        state.tools.set(
          event.toolId,
          this.addEntry(chatId, { kind: 'tool', agent, toolId: event.toolId, name: event.name, detail: event.detail, status: 'running' }),
        );
        break;
      case 'toolCompleted': {
        const entry = state.tools.get(event.toolId);
        if (entry?.kind !== 'tool') break;
        const updated: StoredEntry = { ...entry, status: event.status, output: event.output };
        state.tools.set(event.toolId, updated);
        this.store.updateEntry(updated);
        this.emit({ type: 'entryUpdated', entry: updated });
        break;
      }
      case 'fileChange':
        this.addEntry(chatId, { kind: 'fileChange', agent, paths: event.paths, diff: event.diff });
        break;
      case 'image':
        state.images.push(event.path);
        this.addEntry(chatId, { kind: 'image', agent, path: event.path, prompt: event.prompt });
        break;
      case 'usage':
        this.usage.update(agent, event.usage);
        break;
      case 'error':
        this.addEntry(chatId, { kind: 'error', agent, message: clip(event.message, 2000) });
        break;
      case 'turnCompleted':
        state.status = event.status;
        break;
      case 'background':
        if (event.tasks.length) this.background.set(chatId, event.tasks);
        else this.background.delete(chatId);
        this.emit({ type: 'background', chatId, tasks: event.tasks });
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
