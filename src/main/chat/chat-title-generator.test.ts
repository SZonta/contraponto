import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), rpcClosed: vi.fn(), rpcRequest: vi.fn(), outputs: [] as unknown[] }));
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: mocks.query }));
vi.mock('../agents/binary-paths', () => ({ findClaudeBinary: () => 'claude.exe' }));
vi.mock('../agents/codex/codex-rpc', () => ({
  CodexRpc: class {
    onExit = () => {};
    private listener = (_event: unknown) => {};
    initialize = async () => {};
    onNotification(listener: (event: any) => void) { this.listener = listener; }
    async request(method: string, params: any) {
      mocks.rpcRequest(method, params);
      if (method === 'thread/start') return { thread: { id: 'title-thread' } };
      if (method === 'turn/start') {
        const output = mocks.outputs.shift();
        queueMicrotask(() => {
          this.listener({ method: 'item/completed', params: { threadId: 'title-thread', item: { type: 'agentMessage', text: JSON.stringify(output) } } });
          this.listener({ method: 'turn/completed', params: { threadId: 'title-thread', turn: { status: 'completed' } } });
        });
      }
      return {};
    }
    close() { mocks.rpcClosed(); }
  },
}));
import { ChatTitleGenerator } from './chat-title-generator';

beforeEach(() => {
  mocks.query.mockReset(); mocks.rpcClosed.mockClear(); mocks.rpcRequest.mockClear(); mocks.outputs.length = 0;
});
afterEach(() => vi.restoreAllMocks());

function claudeResult(output: unknown) {
  return { async *[Symbol.asyncIterator]() { yield { type: 'result', subtype: 'success', structured_output: output }; }, close: vi.fn() };
}

describe('chat title generation', () => {
  it('asks Claude for a contextual summary in a temporary session with no tools', async () => {
    const result = claudeResult({ title: 'Teste de comandos e segundo plano' });
    mocks.query.mockReturnValue(result);
    const generator = new ChatTitleGenerator();
    expect(await generator.generate('Faça nesta ordem: listar arquivos e iniciar uma tarefa em segundo plano.', 'claude')).toBe('Teste de comandos e segundo plano');
    expect(mocks.query.mock.calls[0][0]).toMatchObject({ options: { tools: [], persistSession: false, settingSources: [] } });
    expect(result.close).toHaveBeenCalledOnce();
  });
  it('requests a new summary when the first title is oversized, never clipping its words', async () => {
    mocks.query.mockReturnValueOnce(claudeResult({ title: 'a'.repeat(61) })).mockReturnValueOnce(claudeResult({ title: 'Revisão das cotas do chat' }));
    expect(await new ChatTitleGenerator().generate('Pedido detalhado', 'claude')).toBe('Revisão das cotas do chat');
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });
  it('does not accept ellipses even if the output is below the length limit', async () => {
    mocks.query.mockImplementation(() => claudeResult({ title: 'Revisão das cotas...' }));
    expect(await new ChatTitleGenerator().generate('Pedido', 'claude')).toBeNull();
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });
  it('uses an ephemeral Codex thread without altering the working chat', async () => {
    mocks.outputs.push({ title: 'Revisão das cotas do chat' });
    expect(await new ChatTitleGenerator().generate('Revisar os indicadores de uso', 'codex')).toBe('Revisão das cotas do chat');
    expect(mocks.rpcRequest).toHaveBeenCalledWith('thread/start', expect.objectContaining({ ephemeral: true, sandbox: 'read-only' }));
    expect(mocks.rpcClosed).toHaveBeenCalledOnce();
  });
  it('aborts a pending title request when the app shuts down', async () => {
    const close = vi.fn();
    mocks.query.mockImplementation(({ options }) => ({
      async *[Symbol.asyncIterator]() {
        await new Promise((_resolve, reject) => options.abortController.signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true }));
      },
      close,
    }));
    const generator = new ChatTitleGenerator();
    const pending = generator.generate('Pedido', 'claude');
    generator.dispose();
    expect(await pending).toBeNull();
    expect(close).toHaveBeenCalledOnce();
  });
});
