import { describe, expect, it, vi } from 'vitest';
import type { AgentId, UiEvent } from '@shared/types';
import type { AgentAdapter, TurnInput, TurnSink } from '../agents/adapter';
import { SettingsService } from '../orchestrator/settings-service';
import { Store } from '../storage/store';
import { UsageService } from '../usage/usage-service';
import { ChatService, type TurnContext } from './chat-service';

type Script = (input: TurnInput, sink: TurnSink) => Promise<void>;

function fakeAdapter(agent: AgentId, script: Script): AgentAdapter {
  return {
    agent,
    sendTurn: script,
    interrupt: vi.fn(async () => {}),
    listModels: async () => [],
    readUsage: async () => null,
    dispose: () => {},
  };
}

/** Records timeline calls instead of snapshotting a real folder. */
function fakeContext(summary: string | null = null) {
  const finished: { agent: AgentId; prompt: string; result: string }[] = [];
  const context: TurnContext = {
    begin: async () => `ref-${finished.length}`,
    crossSummary: async () => summary,
    finish: async (_project, turn) => {
      finished.push(turn);
      return { id: `t${finished.length}`, files: [`${turn.agent}.txt`] };
    },
    undo: vi.fn(async () => ['claude.txt']),
  };
  return { context, finished };
}

function setup(scripts: { claude?: Script; codex?: Script }, summary: string | null = null) {
  const store = new Store(':memory:');
  const events: UiEvent[] = [];
  const emit = (event: UiEvent) => events.push(event);
  const usage = new UsageService(store, emit);
  const { context, finished } = fakeContext(summary);
  const idle: Script = async (_input, sink) => sink.emit({ type: 'turnCompleted', status: 'completed' });
  const service = new ChatService(
    store,
    { claude: fakeAdapter('claude', scripts.claude ?? idle), codex: fakeAdapter('codex', scripts.codex ?? idle) },
    usage,
    new SettingsService(store),
    context,
    emit,
  );
  const project = store.addProject('C:\\Projetos\\Jogo');
  const chat = store.createChat(project.id);
  const turnsEnded = (count = 1) =>
    vi.waitFor(() => {
      if (events.filter((event) => event.type === 'turnState' && !event.running).length < count) throw new Error('turn still running');
    });
  return { store, events, service, chat, turnsEnded, usage, context, finished };
}

describe('ChatService', () => {
  it('queues a scheduled continuation behind a manual turn and applies its model at execution time', async () => {
    let release!: () => void;
    let first = true;
    const seen: string[] = [];
    const { store, service, chat, turnsEnded } = setup({ claude: async (input, sink) => {
      seen.push(input.model ?? 'default');
      if (first) { first = false; await new Promise<void>((resolve) => { release = resolve; }); }
      sink.emit({ type: 'turnCompleted', status: 'completed' });
    } });
    service.send(chat.id, 'manual', []);
    await vi.waitFor(() => expect(seen).toEqual(['default']));
    const scheduled = service.sendAndWait(chat.id, 'scheduled', { claudeModel: 'sonnet', claudeEffort: 'low' });
    expect(seen).toEqual(['default']); release();
    expect(await scheduled).toBe('completed'); await turnsEnded(2);
    expect(seen).toEqual(['default', 'sonnet']);
    expect(store.listEntries(chat.id).filter((entry) => entry.kind === 'user').map((entry) => entry.text)).toEqual(['manual', 'scheduled']);
    store.close();
  });

  it('returns a scheduled agent failure instead of reporting success', async () => {
    const { store, service, chat } = setup({ codex: async (_input, sink) => {
      sink.emit({ type: 'turnCompleted', status: 'failed' });
    } });
    expect(await service.sendAndWait(chat.id, 'scheduled', { agent: 'codex' })).toBe('failed');
    store.close();
  });

  it('persists a turn, remembers the session and records it in the timeline', async () => {
    const { store, service, chat, turnsEnded, finished } = setup({
      claude: async (input, sink) => {
        expect(input).toMatchObject({ cwd: 'C:\\Projetos\\Jogo', sessionId: null, permission: 'ask', delegate: undefined });
        sink.emit({ type: 'session', sessionId: 's-1' });
        sink.emit({ type: 'toolStarted', toolId: 't1', name: 'Bash', detail: 'ls' });
        sink.emit({ type: 'toolCompleted', toolId: 't1', status: 'done', output: 'a.txt' });
        sink.emit({ type: 'message', text: 'Feito.' });
        sink.emit({ type: 'turnCompleted', status: 'success' });
      },
    });

    service.send(chat.id, 'Liste os arquivos', []);
    await turnsEnded();

    expect(store.getChat(chat.id)).toMatchObject({ claudeSessionId: 's-1', title: 'Liste os arquivos' });
    const entries = store.listEntries(chat.id);
    expect(entries.map((entry) => entry.kind)).toEqual(['user', 'tool', 'assistant', 'turnEnd']);
    expect(entries.at(-1)).toMatchObject({ status: 'success', files: ['claude.txt'], timelineId: 't1' });
    expect(finished).toEqual([expect.objectContaining({ agent: 'claude', prompt: 'Liste os arquivos', result: 'Feito.' })]);
  });

  it('puts the cross summary before the message sent to the agent', async () => {
    let sent = '';
    const { service, chat, turnsEnded } = setup(
      {
        codex: async (input, sink) => {
          sent = input.text;
          sink.emit({ type: 'turnCompleted', status: 'completed' });
        },
      },
      '[Contexto do Contraponto: ...]',
    );
    service.send(chat.id, '@Codex faça a textura', []);
    await turnsEnded();
    expect(sent).toBe('[Contexto do Contraponto: ...]\n\n@Codex faça a textura');
  });

  it('in automatic mode lets Claude delegate to Codex in the same chat', async () => {
    let delegated = '';
    const { store, service, chat, turnsEnded, finished } = setup({
      claude: async (input, sink) => {
        expect(input.instructions).toContain('delegate_to_codex');
        delegated = await input.delegate!('Crie a textura de madeira', 'assets/madeira.png');
        sink.emit({ type: 'message', text: 'Integrei a textura.' });
        sink.emit({ type: 'turnCompleted', status: 'success' });
      },
      codex: async (input, sink) => {
        expect(input.text).toContain('[Tarefa delegada pelo Claude]');
        sink.emit({ type: 'image', path: 'C:\\img.png' });
        sink.emit({ type: 'message', text: 'Textura pronta.' });
        sink.emit({ type: 'turnCompleted', status: 'completed' });
      },
    });
    store.updateChat(chat.id, { agent: 'auto' });

    service.send(chat.id, 'Crie um baú de madeira', []);
    await turnsEnded();

    expect(delegated).toContain('Resposta do Codex: Textura pronta.');
    expect(delegated).toContain('Arquivos alterados: codex.txt');
    expect(delegated).toContain('Imagens geradas: C:\\img.png');
    expect(finished.map((turn) => turn.agent)).toEqual(['codex', 'claude']);
    const kinds = store.listEntries(chat.id).map((entry) => `${entry.kind}${'agent' in entry ? `:${entry.agent}` : ''}`);
    expect(kinds).toEqual(['user', 'image:codex', 'assistant:codex', 'assistant:claude', 'turnEnd:claude']);
  });

  it('hands an automatic message to Codex when Claude is over the quota', async () => {
    const codex = vi.fn<Script>(async (_input, sink) => sink.emit({ type: 'turnCompleted', status: 'completed' }));
    const { store, service, chat, turnsEnded, usage } = setup({ codex });
    store.updateChat(chat.id, { agent: 'auto' });
    usage.update('claude', { fiveHour: { usedPercent: 95, resetsAt: null }, week: null, observedAt: 1 });

    service.send(chat.id, 'Crie um baú', []);
    await turnsEnded();

    expect(codex).toHaveBeenCalledOnce();
    expect(store.listEntries(chat.id)[1]).toMatchObject({ kind: 'notice', text: expect.stringContaining('95%') });
  });

  it('runs turns of the same folder one after the other', async () => {
    let release!: () => void;
    const order: string[] = [];
    const { store, service, chat, turnsEnded } = setup({
      claude: async (input, sink) => {
        order.push(`start ${input.chatId === chat.id ? 'a' : 'b'}`);
        if (input.chatId === chat.id) await new Promise<void>((resolve) => (release = resolve));
        order.push(`end ${input.chatId === chat.id ? 'a' : 'b'}`);
        sink.emit({ type: 'turnCompleted', status: 'success' });
      },
    });
    const other = store.createChat(chat.projectId);

    service.send(chat.id, 'primeiro', []);
    service.send(other.id, 'segundo', []);
    await vi.waitFor(() => expect(order).toEqual(['start a']));
    release();
    await turnsEnded(2);

    expect(order).toEqual(['start a', 'end a', 'start b', 'end b']);
    expect(store.listEntries(other.id)[1]).toMatchObject({ kind: 'notice' });
  });

  it('waits for the user on approvals and passes the decision back', async () => {
    let decision: string | undefined;
    const { service, chat, turnsEnded, events } = setup({
      claude: async (_input, sink) => {
        decision = await sink.approve({ kind: 'command', title: 'Executar comando', detail: 'git push' });
        sink.emit({ type: 'turnCompleted', status: 'success' });
      },
    });

    service.send(chat.id, 'Publique', []);
    const request = await vi.waitFor(() => {
      const event = events.find((item) => item.type === 'approval');
      if (!event || event.type !== 'approval') throw new Error('no approval yet');
      return event.request;
    });
    service.resolveApproval(request.id, 'deny');
    await turnsEnded();
    expect(decision).toBe('deny');
  });

  it('undoes a turn and marks its end entry', async () => {
    const { store, service, chat, turnsEnded, context } = setup({});
    service.send(chat.id, 'oi', []);
    await turnsEnded();
    const end = store.listEntries(chat.id).at(-1)!;

    await vi.waitFor(() => service.undoTurn(end.id));

    expect(context.undo).toHaveBeenCalledWith(expect.objectContaining({ path: 'C:\\Projetos\\Jogo' }), 't1');
    expect(store.getEntry(end.id)).toMatchObject({ undone: true });
    expect(store.listEntries(chat.id).at(-1)).toMatchObject({ kind: 'notice', text: 'Turno desfeito. Arquivos restaurados: claude.txt' });
  });

  it('records an adapter failure as an error entry', async () => {
    const { store, service, chat, turnsEnded } = setup({
      claude: async () => {
        throw new Error('CLI não encontrada');
      },
    });
    service.send(chat.id, 'oi', []);
    await turnsEnded();
    const entries = store.listEntries(chat.id);
    expect(entries.find((entry) => entry.kind === 'error')).toMatchObject({ message: 'CLI não encontrada' });
    expect(entries.at(-1)).toMatchObject({ kind: 'turnEnd', status: 'failed' });
  });

  it('keeps background work visible after the turn ends, until the agent reports it done', async () => {
    let sink!: TurnSink;
    const { service, chat, events, turnsEnded } = setup({ claude: async (_input, turnSink) => {
      sink = turnSink;
      sink.emit({ type: 'background', tasks: ['Render video'] });
      sink.emit({ type: 'turnCompleted', status: 'success' });
    } });
    service.send(chat.id, 'render', []);
    await turnsEnded();
    expect(service.backgroundTasks()).toEqual({ [chat.id]: ['Render video'] });
    sink.emit({ type: 'background', tasks: [] });
    expect(service.backgroundTasks()).toEqual({});
    expect(events.filter((event) => event.type === 'background').map((event) => event.type === 'background' && event.tasks))
      .toEqual([['Render video'], []]);
  });
});
