import { describe, expect, it, vi } from 'vitest';
import type { UiEvent } from '@shared/types';
import type { AgentAdapter, TurnInput, TurnSink } from '../agents/adapter';
import { Store } from '../storage/store';
import { UsageService } from '../usage/usage-service';
import { ChatService } from './chat-service';

function fakeAdapter(agent: 'claude' | 'codex', script: (input: TurnInput, sink: TurnSink) => Promise<void>): AgentAdapter {
  return {
    agent,
    sendTurn: script,
    interrupt: vi.fn(async () => {}),
    listModels: async () => [],
    readUsage: async () => null,
    dispose: () => {},
  };
}

function setup(script: (input: TurnInput, sink: TurnSink) => Promise<void>) {
  const store = new Store(':memory:');
  const events: UiEvent[] = [];
  const emit = (event: UiEvent) => events.push(event);
  const usage = new UsageService(store, emit);
  const adapter = fakeAdapter('claude', script);
  const service = new ChatService(store, { claude: adapter, codex: fakeAdapter('codex', script) }, usage, emit);
  const project = store.addProject('C:\\Projetos\\Jogo');
  const chat = store.createChat(project.id);
  const turnEnded = () =>
    vi.waitFor(() => {
      if (!events.some((event) => event.type === 'turnState' && !event.running)) throw new Error('turn still running');
    });
  return { store, events, service, chat, turnEnded };
}

describe('ChatService', () => {
  it('persists a full turn and remembers the session id', async () => {
    const { store, service, chat, turnEnded, events } = setup(async (input, sink) => {
      expect(input).toMatchObject({ cwd: 'C:\\Projetos\\Jogo', sessionId: null, permission: 'ask' });
      sink.emit({ type: 'session', sessionId: 's-1' });
      sink.emit({ type: 'textDelta', text: 'Fei' });
      sink.emit({ type: 'toolStarted', toolId: 't1', name: 'Bash', detail: 'ls' });
      sink.emit({ type: 'toolCompleted', toolId: 't1', status: 'done', output: 'a.txt' });
      sink.emit({ type: 'message', text: 'Feito.' });
      sink.emit({ type: 'usage', usage: { fiveHour: { usedPercent: 40, resetsAt: null }, week: null, observedAt: 1 } });
      sink.emit({ type: 'turnCompleted', status: 'success' });
    });

    service.send(chat.id, 'Liste os arquivos da pasta', []);
    await turnEnded();

    expect(store.getChat(chat.id)).toMatchObject({ claudeSessionId: 's-1', title: 'Liste os arquivos da pasta' });
    expect(store.listEntries(chat.id).map((entry) => entry.kind)).toEqual(['user', 'tool', 'assistant', 'turnEnd']);
    expect(store.listEntries(chat.id)[1]).toMatchObject({ status: 'done', output: 'a.txt' });
    expect(events).toContainEqual({ type: 'textDelta', chatId: chat.id, agent: 'claude', text: 'Fei' });
    expect(events).toContainEqual(expect.objectContaining({ type: 'usage', usage: expect.objectContaining({ agent: 'claude' }) }));
  });

  it('waits for the user on approvals and passes the decision back', async () => {
    let decision: string | undefined;
    const { service, chat, turnEnded, events } = setup(async (_input, sink) => {
      decision = await sink.approve({ kind: 'command', title: 'Executar comando', detail: 'git push' });
      sink.emit({ type: 'turnCompleted', status: 'success' });
    });

    service.send(chat.id, 'Publique', []);
    const request = await vi.waitFor(() => {
      const event = events.find((item) => item.type === 'approval');
      if (!event || event.type !== 'approval') throw new Error('no approval yet');
      return event.request;
    });
    expect(service.pendingApprovals()).toHaveLength(1);

    service.resolveApproval(request.id, 'deny');
    await turnEnded();
    expect(decision).toBe('deny');
    expect(service.pendingApprovals()).toHaveLength(0);
  });

  it('refuses a second message while the chat is still answering', () => {
    const { service, chat } = setup(() => new Promise(() => {}));
    service.send(chat.id, 'primeira', []);
    expect(() => service.send(chat.id, 'segunda', [])).toThrow('ainda está respondendo');
  });

  it('records an adapter failure as an error entry', async () => {
    const { store, service, chat, turnEnded } = setup(async () => {
      throw new Error('CLI não encontrada');
    });
    service.send(chat.id, 'oi', []);
    await turnEnded();
    expect(store.listEntries(chat.id).at(-1)).toMatchObject({ kind: 'error', message: 'CLI não encontrada' });
  });
});
