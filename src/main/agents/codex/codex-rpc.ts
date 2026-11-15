import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { unpackedPath } from '../binary-paths';

type RequestId = number | string;
type Pending = { resolve: (value: any) => void; reject: (error: Error) => void };

export type RpcNotification = { method: string; params?: any };
export type RpcServerRequest = { id: RequestId; method: string; params?: any };

const VENDOR_BINARY = path.join('vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe');

/** The pinned @openai/codex dependency of the app, like the Agent SDK brings its own Claude Code. */
function projectCandidates(): string[] {
  try {
    const packageDir = path.dirname(createRequire(import.meta.url).resolve('@openai/codex/package.json'));
    return [
      path.join(packageDir, 'node_modules', '@openai', 'codex-win32-x64', VENDOR_BINARY),
      path.join(packageDir, '..', 'codex-win32-x64', VENDOR_BINARY),
    ];
  } catch {
    return [];
  }
}

/**
 * Native codex.exe. Running it directly avoids codex.js, which cannot be started through
 * Electron's own Node. Only the pinned dependency is used, also after packaging.
 */
export function findCodexBinary(): string {
  const candidates = projectCandidates().map(unpackedPath);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Codex CLI não encontrado. Procurei em:\n${candidates.join('\n')}`);
  return found;
}

/** Client for `codex app-server`: newline-delimited JSON-RPC over stdio. */
export class CodexRpc {
  private readonly proc: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private readonly pending = new Map<RequestId, Pending>();
  private readonly listeners = new Set<(notification: RpcNotification) => void>();
  exited = false;
  onExit: () => void = () => {};

  serverRequestHandler: (request: RpcServerRequest) => Promise<unknown> = async (request) => {
    throw new Error(`Unhandled server request: ${request.method}`);
  };

  constructor(binary = findCodexBinary()) {
    this.proc = spawn(binary, ['app-server'], { stdio: 'pipe', windowsHide: true });
    createInterface({ input: this.proc.stdout }).on('line', (line) => this.handleLine(line));
    this.proc.stderr.on('data', (chunk) => console.error(`[codex] ${chunk}`));
    this.proc.on('exit', (code) => {
      this.exited = true;
      for (const pending of this.pending.values()) pending.reject(new Error(`codex app-server saiu (código ${code})`));
      this.pending.clear();
      this.onExit();
    });
  }

  onNotification(listener: (notification: RpcNotification) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  request<T = any>(method: string, params?: unknown): Promise<T> {
    if (this.exited) return Promise.reject(new Error('codex app-server não está rodando'));
    const id = this.nextId++;
    this.send(params === undefined ? { id, method } : { id, method, params });
    return new Promise<T>((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  notify(method: string, params?: unknown): void {
    this.send(params === undefined ? { method } : { method, params });
  }

  async initialize(): Promise<void> {
    await this.request('initialize', {
      clientInfo: { name: 'contraponto', title: 'Contraponto', version: '0.1.0' },
      capabilities: null,
    });
    this.notify('initialized');
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
      console.error(`[codex] linha fora do protocolo: ${line}`);
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
      if (message.error) pending.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
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
