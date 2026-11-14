import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';

type RequestId = number | string;
type Pending = { resolve: (value: any) => void; reject: (error: Error) => void };

export type RpcNotification = { method: string; params?: any };
export type RpcServerRequest = { id: RequestId; method: string; params?: any };

const CODEX_JS = path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');

/** Minimal client for `codex app-server` (newline-delimited JSON-RPC over stdio). */
export class CodexRpc {
  private readonly proc: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private readonly pending = new Map<RequestId, Pending>();
  private readonly listeners = new Set<(notification: RpcNotification) => void>();

  serverRequestHandler: (request: RpcServerRequest) => Promise<unknown> = async (request) => {
    throw new Error(`Unhandled server request: ${request.method}`);
  };

  constructor(extraArgs: string[] = []) {
    // Spawning node + codex.js avoids going through codex.cmd and a shell.
    this.proc = spawn(process.execPath, [CODEX_JS, 'app-server', ...extraArgs], { stdio: 'pipe' });
    createInterface({ input: this.proc.stdout }).on('line', (line) => this.handleLine(line));
    this.proc.stderr.on('data', (chunk) => process.stderr.write(`[codex] ${chunk}`));
    this.proc.on('exit', (code) => {
      for (const pending of this.pending.values()) pending.reject(new Error(`codex app-server exited (${code})`));
      this.pending.clear();
    });
  }

  onNotification(listener: (notification: RpcNotification) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  request<T = any>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId++;
    this.send(params === undefined ? { id, method } : { id, method, params });
    return new Promise<T>((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  notify(method: string, params?: unknown): void {
    this.send(params === undefined ? { method } : { method, params });
  }

  async initialize(name: string): Promise<any> {
    const result = await this.request('initialize', {
      clientInfo: { name, title: name, version: '0.0.0' },
      capabilities: null,
    });
    this.notify('initialized');
    return result;
  }

  /** Register before `turn/start` so the completion is not missed. */
  waitForTurnCompleted(threadId: string): Promise<any> {
    return new Promise((resolve) => {
      const off = this.onNotification(({ method, params }) => {
        if (method === 'turn/completed' && params?.threadId === threadId) {
          off();
          resolve(params);
        }
      });
    });
  }

  close(): void {
    this.proc.stdin.end();
    this.proc.kill();
  }

  private send(message: object): void {
    this.proc.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string): void {
    if (!line.trim()) return;
    let message: any;
    try {
      message = JSON.parse(line);
    } catch {
      process.stderr.write(`[codex] non-JSON line: ${line}\n`);
      return;
    }
    if (message.id !== undefined && message.method) {
      void this.answer(message);
      return;
    }
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
      return;
    }
    for (const listener of this.listeners) listener(message);
  }

  private async answer(request: RpcServerRequest): Promise<void> {
    try {
      this.send({ id: request.id, result: await this.serverRequestHandler(request) });
    } catch (error) {
      this.send({ id: request.id, error: { code: -32603, message: String(error) } });
    }
  }
}

export function formatCodexLimits(snapshot: any): string {
  const describe = (window: any) => {
    if (!window) return 'n/a';
    const minutes = window.windowDurationMins;
    const label = minutes === 300 ? '5h' : minutes === 10080 ? 'week' : `${minutes ?? '?'}min`;
    const resetMs = window.resetsAt > 1e12 ? window.resetsAt : window.resetsAt * 1000;
    const reset = window.resetsAt ? new Date(resetMs).toLocaleString('pt-BR') : '?';
    return `${label} ${window.usedPercent}% (resets ${reset}, raw ${window.resetsAt})`;
  };
  return `primary: ${describe(snapshot?.primary)} | secondary: ${describe(snapshot?.secondary)}`;
}

export function describeCodexItem(item: any): string {
  switch (item.type) {
    case 'commandExecution':
      return `command "${item.command}" exit=${item.exitCode}`;
    case 'fileChange':
      return `fileChange ${item.changes.map((change: any) => change.path).join(', ')} (${item.status})`;
    case 'agentMessage':
      return `agentMessage (${item.text.length} chars)`;
    case 'imageGeneration':
      return `imageGeneration status=${item.status} savedPath=${item.savedPath ?? '-'}`;
    default:
      return item.type;
  }
}
