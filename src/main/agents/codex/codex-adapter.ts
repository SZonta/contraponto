import type { AgentUsage, ApprovalDecision, ModelOption, PermissionLevel } from '@shared/types';
import type { AgentAdapter, TurnInput, TurnSink } from '../adapter';
import { mapCodexNotification, mapCodexRateLimits } from './codex-mapper';
import { CodexRpc, type RpcServerRequest } from './codex-rpc';

const APPROVAL_POLICIES: Record<PermissionLevel, string> = { ask: 'untrusted', acceptEdits: 'on-request', full: 'never' };
const SANDBOX_MODES: Record<PermissionLevel, string> = {
  ask: 'workspace-write',
  acceptEdits: 'workspace-write',
  full: 'danger-full-access',
};

function sandboxPolicy(level: PermissionLevel): object {
  return level === 'full'
    ? { type: 'dangerFullAccess' }
    : { type: 'workspaceWrite', writableRoots: [], networkAccess: false, excludeTmpdirEnvVar: false, excludeSlashTmp: false };
}

function decisionFor(decision: ApprovalDecision): string {
  return decision === 'allow' ? 'accept' : decision === 'allowSession' ? 'acceptForSession' : 'decline';
}

type ActiveTurn = { chatId: string; threadId: string; turnId: string | null; sink: TurnSink; resolve: () => void };

/** One `codex app-server` process for the whole app; one Codex thread per chat. */
export class CodexAdapter implements AgentAdapter {
  readonly agent = 'codex' as const;
  private rpc: CodexRpc | null = null;
  private starting: Promise<CodexRpc> | null = null;
  private readonly loadedThreads = new Set<string>();
  private readonly activeTurns = new Map<string, ActiveTurn>();

  /** Called on every rate-limit update, even outside turns. */
  onUsage: (usage: Omit<AgentUsage, 'agent'>) => void = () => {};

  async sendTurn(input: TurnInput, sink: TurnSink): Promise<void> {
    const rpc = await this.connection();
    const threadId = await this.openThread(rpc, input, sink);

    const done = new Promise<void>((resolve) => {
      this.activeTurns.set(threadId, { chatId: input.chatId, threadId, turnId: null, sink, resolve });
    });
    const textInput = input.attachments.some((file) => !file.mimeType.startsWith('image/'))
      ? `${input.text}\n\nArquivos anexados:\n${input.attachments
          .filter((file) => !file.mimeType.startsWith('image/'))
          .map((file) => `- ${file.path}`)
          .join('\n')}`
      : input.text;

    try {
      const response = await rpc.request('turn/start', {
        threadId,
        input: [
          { type: 'text', text: textInput, text_elements: [] },
          ...input.attachments
            .filter((file) => file.mimeType.startsWith('image/'))
            .map((file) => ({ type: 'localImage', path: file.path })),
        ],
        model: input.model,
        effort: input.effort,
        approvalPolicy: APPROVAL_POLICIES[input.permission],
        sandboxPolicy: sandboxPolicy(input.permission),
      });
      const active = this.activeTurns.get(threadId);
      if (active) active.turnId = response.turn?.id ?? null;
    } catch (error) {
      sink.emit({ type: 'error', message: `Codex recusou o turno: ${error instanceof Error ? error.message : String(error)}` });
      sink.emit({ type: 'turnCompleted', status: 'failed' });
      this.finish(threadId);
    }
    await done;
  }

  async interrupt(chatId: string): Promise<void> {
    const turn = [...this.activeTurns.values()].find((active) => active.chatId === chatId);
    if (turn?.turnId && this.rpc) await this.rpc.request('turn/interrupt', { threadId: turn.threadId, turnId: turn.turnId });
  }

  async listModels(): Promise<ModelOption[]> {
    const rpc = await this.connection();
    const response = await rpc.request('model/list', {});
    return response.data
      .filter((model: any) => !model.hidden)
      .map((model: any) => ({
        id: model.id,
        label: model.displayName,
        efforts: model.supportedReasoningEfforts.map((option: any) => option.reasoningEffort),
        defaultEffort: model.defaultReasoningEffort,
        isDefault: model.isDefault,
      }));
  }

  async readUsage(): Promise<Omit<AgentUsage, 'agent'> | null> {
    const rpc = await this.connection();
    const response = await rpc.request('account/rateLimits/read');
    return mapCodexRateLimits(response.rateLimits);
  }

  dispose(): void {
    this.rpc?.close();
    this.rpc = null;
  }

  private async openThread(rpc: CodexRpc, input: TurnInput, sink: TurnSink): Promise<string> {
    const settings = {
      cwd: input.cwd,
      model: input.model,
      approvalPolicy: APPROVAL_POLICIES[input.permission],
      sandbox: SANDBOX_MODES[input.permission],
      developerInstructions: input.instructions ?? null,
      // Projects that only have CLAUDE.md share it with Codex without creating files.
      config: { project_doc_fallback_filenames: ['CLAUDE.md'] },
    };
    if (!input.sessionId) {
      const started = await rpc.request('thread/start', settings);
      this.loadedThreads.add(started.thread.id);
      sink.emit({ type: 'session', sessionId: started.thread.id });
      return started.thread.id;
    }
    if (!this.loadedThreads.has(input.sessionId)) {
      await rpc.request('thread/resume', { threadId: input.sessionId, ...settings, excludeTurns: true });
      this.loadedThreads.add(input.sessionId);
    }
    return input.sessionId;
  }

  /** Starts app-server on first use and again after it exits. */
  private connection(): Promise<CodexRpc> {
    if (this.rpc && !this.rpc.exited) return Promise.resolve(this.rpc);
    this.starting ??= (async () => {
      const rpc = new CodexRpc();
      rpc.serverRequestHandler = (request) => this.answer(request);
      rpc.onNotification(({ method, params }) => this.route(method, params));
      rpc.onExit = () => {
        for (const active of [...this.activeTurns.values()]) {
          active.sink.emit({ type: 'error', message: 'O processo do Codex fechou no meio do turno.' });
          active.sink.emit({ type: 'turnCompleted', status: 'failed' });
          this.finish(active.threadId);
        }
      };
      await rpc.initialize();
      this.loadedThreads.clear();
      this.rpc = rpc;
      return rpc;
    })().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private route(method: string, params: any): void {
    if (method === 'account/rateLimits/updated') {
      this.onUsage(mapCodexRateLimits(params.rateLimits));
      return;
    }
    const active = params?.threadId ? this.activeTurns.get(params.threadId) : undefined;
    if (!active) return;
    for (const event of mapCodexNotification(method, params)) {
      active.sink.emit(event);
      if (event.type === 'turnCompleted') this.finish(active.threadId);
    }
  }

  private async answer(request: RpcServerRequest): Promise<unknown> {
    const active = this.activeTurns.get(request.params?.threadId);
    switch (request.method) {
      case 'item/commandExecution/requestApproval': {
        const decision = active
          ? await active.sink.approve({ kind: 'command', title: 'Executar comando', detail: request.params.command ?? request.params.reason ?? '' })
          : 'deny';
        return { decision: decisionFor(decision) };
      }
      case 'item/fileChange/requestApproval': {
        const decision = active
          ? await active.sink.approve({ kind: 'file', title: 'Alterar arquivos', detail: request.params.reason ?? 'O Codex quer gravar arquivos.' })
          : 'deny';
        return { decision: decisionFor(decision) };
      }
      default:
        throw new Error(`Pedido não suportado: ${request.method}`);
    }
  }

  private finish(threadId: string): void {
    const active = this.activeTurns.get(threadId);
    this.activeTurns.delete(threadId);
    active?.resolve();
  }
}
