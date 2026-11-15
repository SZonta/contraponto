import type { UsageWindow } from '@shared/types';
import { truncate, type AdapterEvent } from '../adapter';

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

export function describeClaudeTool(name: string, input: Record<string, any>): string {
  if (typeof input.command === 'string') return input.command;
  if (typeof input.file_path === 'string') return input.file_path;
  if (typeof input.notebook_path === 'string') return input.notebook_path;
  if (typeof input.pattern === 'string') return input.pattern;
  if (typeof input.url === 'string') return input.url;
  if (typeof input.query === 'string') return input.query;
  return truncate(JSON.stringify(input), 300);
}

function toWindow(window: any): UsageWindow | null {
  if (!window || typeof window.utilization !== 'number') return null;
  return {
    usedPercent: Math.round(window.utilization * 100),
    resetsAt: typeof window.resetsAt === 'number' ? window.resetsAt * 1000 : null,
  };
}

function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part: any) => (part?.type === 'text' ? part.text : '')).join('\n');
  }
  return '';
}

/** Converts Agent SDK messages into AdapterEvents; keeps tool calls in flight to report file changes. */
export class ClaudeEventMapper {
  private readonly pendingFileTools = new Map<string, string>();

  map(message: any): AdapterEvent[] {
    // Messages from subagents (Task tool) stay out of the main chat.
    if (message.parent_tool_use_id) return [];

    switch (message.type) {
      case 'system':
        if (message.subtype === 'init') return [{ type: 'session', sessionId: message.session_id }];
        if (message.subtype === 'background_tasks_changed') {
          // Ambient tasks (watchers, housekeeping) are not activity.
          const tasks = (message.tasks ?? []).filter((task: any) => !task.ambient);
          return [{ type: 'background', tasks: tasks.map((task: any) => String(task.description || 'Tarefa em segundo plano')) }];
        }
        return [];

      case 'stream_event': {
        const event = message.event;
        if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          return [{ type: 'textDelta', text: event.delta.text }];
        }
        return [];
      }

      case 'assistant': {
        const events: AdapterEvent[] = [];
        for (const block of message.message?.content ?? []) {
          if (block.type === 'text' && block.text.trim()) events.push({ type: 'message', text: block.text });
          if (block.type === 'tool_use') {
            const input = (block.input ?? {}) as Record<string, any>;
            events.push({ type: 'toolStarted', toolId: block.id, name: block.name, detail: describeClaudeTool(block.name, input) });
            const filePath = input.file_path ?? input.notebook_path;
            if (FILE_TOOLS.has(block.name) && typeof filePath === 'string') this.pendingFileTools.set(block.id, filePath);
          }
        }
        return events;
      }

      case 'user': {
        const content = message.message?.content;
        if (!Array.isArray(content)) return [];
        const events: AdapterEvent[] = [];
        for (const block of content) {
          if (block.type !== 'tool_result') continue;
          const failed = Boolean(block.is_error);
          events.push({
            type: 'toolCompleted',
            toolId: block.tool_use_id,
            status: failed ? 'failed' : 'done',
            output: truncate(resultText(block.content)),
          });
          const filePath = this.pendingFileTools.get(block.tool_use_id);
          this.pendingFileTools.delete(block.tool_use_id);
          if (filePath && !failed) events.push({ type: 'fileChange', paths: [filePath] });
        }
        return events;
      }

      case 'rate_limit_event': {
        const windows = message.rate_limit_info?.unifiedWindows;
        if (!windows) return [];
        return [
          {
            type: 'usage',
            usage: { fiveHour: toWindow(windows.five_hour), week: toWindow(windows.seven_day), observedAt: Date.now() },
          },
        ];
      }

      case 'result': {
        const events: AdapterEvent[] = [];
        if (message.subtype !== 'success') {
          const details = Array.isArray(message.errors) ? message.errors.join('; ') : '';
          events.push({ type: 'error', message: `Claude terminou com ${message.subtype}${details ? `: ${details}` : ''}` });
        }
        events.push({ type: 'turnCompleted', status: message.subtype });
        return events;
      }

      default:
        return [];
    }
  }
}
