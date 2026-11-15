import type { AgentUsage, UsageWindow } from '@shared/types';
import { truncate, type AdapterEvent } from '../adapter';

const FIVE_HOURS_MINUTES = 300;
const WEEK_MINUTES = 10080;

function toWindow(window: any): UsageWindow {
  return { usedPercent: window.usedPercent, resetsAt: typeof window.resetsAt === 'number' ? window.resetsAt * 1000 : null };
}

/** Codex reports a primary and a secondary window; their duration says which is which. */
export function mapCodexRateLimits(snapshot: any): Omit<AgentUsage, 'agent'> {
  const windows = [snapshot?.primary, snapshot?.secondary].filter(Boolean);
  const find = (minutes: number) => windows.find((window) => window.windowDurationMins === minutes);
  const fiveHour = find(FIVE_HOURS_MINUTES) ?? snapshot?.primary;
  const week = find(WEEK_MINUTES) ?? snapshot?.secondary;
  return { fiveHour: fiveHour ? toWindow(fiveHour) : null, week: week ? toWindow(week) : null, observedAt: Date.now() };
}

function itemStarted(item: any): AdapterEvent[] {
  switch (item.type) {
    case 'commandExecution':
      return [{ type: 'toolStarted', toolId: item.id, name: 'Comando', detail: item.command }];
    case 'mcpToolCall':
      return [{ type: 'toolStarted', toolId: item.id, name: `${item.server}.${item.tool}`, detail: truncate(JSON.stringify(item.arguments), 300) }];
    case 'webSearch':
      return [{ type: 'toolStarted', toolId: item.id, name: 'Busca na web', detail: item.query ?? '' }];
    default:
      return [];
  }
}

function itemCompleted(item: any): AdapterEvent[] {
  switch (item.type) {
    case 'agentMessage':
      return item.text?.trim() ? [{ type: 'message', text: item.text }] : [];
    case 'commandExecution':
      return [
        {
          type: 'toolCompleted',
          toolId: item.id,
          status: item.exitCode === 0 ? 'done' : 'failed',
          output: truncate(item.aggregatedOutput ?? ''),
        },
      ];
    case 'mcpToolCall':
      return [{ type: 'toolCompleted', toolId: item.id, status: item.error ? 'failed' : 'done' }];
    case 'webSearch':
      return [{ type: 'toolCompleted', toolId: item.id, status: 'done' }];
    case 'fileChange':
      return item.changes?.length
        ? [
            {
              type: 'fileChange',
              paths: item.changes.map((change: any) => change.path),
              diff: truncate(item.changes.map((change: any) => change.diff).join('\n'), 20000),
            },
          ]
        : [];
    case 'imageGeneration':
      return item.status === 'completed' && item.savedPath
        ? [{ type: 'image', path: item.savedPath, prompt: item.revisedPrompt ?? undefined }]
        : [];
    default:
      return [];
  }
}

/** Converts one app-server notification for a thread into AdapterEvents. */
export function mapCodexNotification(method: string, params: any): AdapterEvent[] {
  switch (method) {
    case 'item/agentMessage/delta':
      return [{ type: 'textDelta', text: params.delta }];
    case 'item/started':
      return itemStarted(params.item);
    case 'item/completed':
      return itemCompleted(params.item);
    case 'error':
      return [{ type: 'error', message: params?.error?.message ?? JSON.stringify(params) }];
    case 'turn/completed': {
      const events: AdapterEvent[] = [];
      if (params.turn?.status === 'failed') {
        events.push({ type: 'error', message: params.turn.error?.message ?? 'O turno do Codex falhou.' });
      }
      events.push({ type: 'turnCompleted', status: params.turn?.status ?? 'completed' });
      return events;
    }
    default:
      return [];
  }
}
