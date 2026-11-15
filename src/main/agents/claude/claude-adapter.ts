import { readFileSync } from 'node:fs';
import os from 'node:os';
import {
  createSdkMcpServer,
  query,
  tool,
  type EffortLevel,
  type PermissionMode,
  type Query,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { AgentUsage, ApprovalDecision, ModelOption, PermissionLevel } from '@shared/types';
import { AsyncQueue } from '../async-queue';
import type { AdapterEvent, AgentAdapter, ApprovalPrompt, TurnInput, TurnSink } from '../adapter';
import { ClaudeEventMapper, describeClaudeTool } from './claude-mapper';
import { claudeSubagentEnv } from './subagent-env';

const PERMISSION_MODES: Record<PermissionLevel, PermissionMode> = {
  ask: 'default',
  acceptEdits: 'acceptEdits',
  full: 'bypassPermissions',
};

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

function approvalPrompt(toolName: string, input: Record<string, unknown>): ApprovalPrompt {
  const isCommand = toolName === 'Bash' || toolName === 'PowerShell';
  const isFile = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(toolName);
  return {
    kind: isCommand ? 'command' : isFile ? 'file' : 'tool',
    title: isCommand ? 'Executar comando' : isFile ? `Alterar arquivo (${toolName})` : `Usar ${toolName}`,
    detail: describeClaudeTool(toolName, input as Record<string, any>),
  };
}

/** Builds the user message; images go inline, other files are referenced by path. */
function userMessage(input: TurnInput): SDKUserMessage {
  const images = input.attachments.filter((file) => IMAGE_TYPES.has(file.mimeType));
  const others = input.attachments.filter((file) => !IMAGE_TYPES.has(file.mimeType));
  const text = others.length
    ? `${input.text}\n\nArquivos anexados:\n${others.map((file) => `- ${file.path}`).join('\n')}`
    : input.text;
  const content: any[] = [{ type: 'text', text }];
  for (const image of images) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: image.mimeType, data: readFileSync(image.path).toString('base64') },
    });
  }
  return { type: 'user', message: { role: 'user', content }, parent_tool_use_id: null, origin: { kind: 'human' } } as SDKUserMessage;
}

type ActiveTurn = { sink: TurnSink; resolve: () => void; delegate?: TurnInput['delegate'] };

const DELEGATE_TOOL = 'mcp__contraponto__delegate_to_codex';

/**
 * One long-lived Claude Code process per chat, fed through streaming input,
 * so the prompt cache is reused between messages.
 */
class ClaudeSession {
  readonly configKey: string;
  private readonly queue = new AsyncQueue<SDKUserMessage>();
  private readonly query: Query;
  private readonly mapper = new ClaudeEventMapper();
  private active: ActiveTurn | null = null;
  closed = false;

  constructor(input: TurnInput, configKey: string) {
    this.configKey = configKey;
    this.query = query({
      prompt: this.queue,
      options: {
        cwd: input.cwd,
        model: input.model ?? undefined,
        effort: (input.effort as EffortLevel | null) ?? undefined,
        permissionMode: PERMISSION_MODES[input.permission],
        allowDangerouslySkipPermissions: input.permission === 'full',
        resume: input.sessionId ?? undefined,
        env: { ...process.env, ...claudeSubagentEnv(input.model, input.effort) },
        includePartialMessages: true,
        settingSources: ['user', 'project', 'local'],
        systemPrompt: { type: 'preset', preset: 'claude_code', append: input.instructions },
        mcpServers: input.delegate ? { contraponto: this.delegateServer() } : undefined,
        canUseTool: async (toolName, toolInput, { suggestions }) => {
          // Delegating needs no card: what Codex does asks for its own approvals.
          if (toolName === DELEGATE_TOOL) return { behavior: 'allow', updatedInput: toolInput };
          const decision = this.active
            ? await this.active.sink.approve(approvalPrompt(toolName, toolInput))
            : ('deny' as ApprovalDecision);
          if (decision === 'deny') return { behavior: 'deny', message: 'O usuário negou esta ação.' };
          return {
            behavior: 'allow',
            updatedInput: toolInput,
            updatedPermissions: decision === 'allowSession' ? suggestions : undefined,
          };
        },
      },
    });
    void this.pump();
  }

  send(input: TurnInput, sink: TurnSink): Promise<void> {
    return new Promise((resolve) => {
      this.active = { sink, resolve, delegate: input.delegate };
      this.queue.push(userMessage(input));
    });
  }

  /** In-process MCP server exposing delegate_to_codex; it calls the delegate of the turn in progress. */
  private delegateServer() {
    const delegateTool = tool(
      'delegate_to_codex',
      'Delegate a self-contained subtask to Codex, the other AI agent working in the same folder (3D models in Blender, images, textures, visual design). Returns the final answer of Codex and the files it changed.',
      {
        task: z.string().describe('Complete, self-contained brief: context, files involved and where to save the result'),
        expected_output: z.string().describe('What Codex must deliver'),
      },
      async ({ task, expected_output }) => {
        const delegate = this.active?.delegate;
        const text = delegate ? await delegate(task, expected_output) : 'Codex indisponível neste turno.';
        return { content: [{ type: 'text', text }] };
      },
      { alwaysLoad: true },
    );
    return createSdkMcpServer({ name: 'contraponto', version: '0.1.0', tools: [delegateTool] });
  }

  interrupt(): Promise<unknown> {
    return this.query.interrupt();
  }

  close(): void {
    this.closed = true;
    this.queue.close();
    this.query.close();
  }

  private async pump(): Promise<void> {
    try {
      for await (const message of this.query) {
        for (const event of this.mapper.map(message)) this.dispatch(event);
      }
    } catch (error) {
      this.dispatch({ type: 'error', message: `Claude parou: ${error instanceof Error ? error.message : String(error)}` });
      this.dispatch({ type: 'turnCompleted', status: 'failed' });
    } finally {
      this.closed = true;
      this.finishTurn();
    }
  }

  private dispatch(event: AdapterEvent): void {
    this.active?.sink.emit(event);
    if (event.type === 'turnCompleted') this.finishTurn();
  }

  private finishTurn(): void {
    const active = this.active;
    this.active = null;
    active?.resolve();
  }
}

export class ClaudeAdapter implements AgentAdapter {
  readonly agent = 'claude' as const;
  private readonly sessions = new Map<string, ClaudeSession>();
  private probeResult?: Promise<{ models: ModelOption[]; usage: Omit<AgentUsage, 'agent'> | null }>;

  async sendTurn(input: TurnInput, sink: TurnSink): Promise<void> {
    // Changing folder, model, effort or permission restarts the process and resumes the same session.
    const configKey = [input.cwd, input.model, input.effort, input.permission, Boolean(input.delegate), input.instructions ?? ''].join('|');
    let session = this.sessions.get(input.chatId);
    if (session && (session.closed || session.configKey !== configKey)) {
      session.close();
      session = undefined;
    }
    if (!session) {
      session = new ClaudeSession(input, configKey);
      this.sessions.set(input.chatId, session);
    }
    await session.send(input, sink);
  }

  async interrupt(chatId: string): Promise<void> {
    await this.sessions.get(chatId)?.interrupt();
  }

  async listModels(): Promise<ModelOption[]> {
    return (await this.probe()).models;
  }

  async readUsage(): Promise<Omit<AgentUsage, 'agent'> | null> {
    this.probeResult = undefined;
    return (await this.probe()).usage;
  }

  dispose(): void {
    for (const session of this.sessions.values()) session.close();
    this.sessions.clear();
  }

  /** Starts Claude Code without sending a prompt: listing models and plan usage spends no tokens. */
  private probe(): Promise<{ models: ModelOption[]; usage: Omit<AgentUsage, 'agent'> | null }> {
    this.probeResult ??= (async () => {
      const idle = new AsyncQueue<SDKUserMessage>();
      const session = query({ prompt: idle, options: { cwd: os.homedir(), persistSession: false } });
      try {
        const models = (await session.supportedModels()).map((model) => ({
          id: model.value,
          label: model.displayName,
          efforts: model.supportedEffortLevels ?? [],
          defaultEffort: null,
          isDefault: model.value === 'default',
        }));
        // Experimental SDK API: isolated here so a rename only touches this line.
        const usage = await session.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true });
        const toWindow = (window: { utilization: number | null; resets_at: string | null } | null | undefined) =>
          window && window.utilization !== null
            ? { usedPercent: Math.round(window.utilization), resetsAt: window.resets_at ? Date.parse(window.resets_at) : null }
            : null;
        const limits = usage.rate_limits;
        return {
          models,
          usage: limits ? { fiveHour: toWindow(limits.five_hour), week: toWindow(limits.seven_day), observedAt: Date.now() } : null,
        };
      } finally {
        idle.close();
        session.close();
      }
    })();
    this.probeResult.catch(() => {
      this.probeResult = undefined;
    });
    return this.probeResult;
  }
}
