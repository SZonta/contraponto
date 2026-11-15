import { describe, expect, it } from 'vitest';
import { mapCodexNotification, mapCodexRateLimits } from './codex-mapper';

describe('mapCodexNotification', () => {
  it('streams agent text and closes it with the completed message', () => {
    expect(mapCodexNotification('item/agentMessage/delta', { delta: 'Oi' })).toEqual([{ type: 'textDelta', text: 'Oi' }]);
    expect(mapCodexNotification('item/completed', { item: { type: 'agentMessage', id: 'm1', text: 'Oi!' } })).toEqual([
      { type: 'message', text: 'Oi!' },
    ]);
  });

  it('maps a command to a tool card that fails on a non-zero exit code', () => {
    const started = mapCodexNotification('item/started', { item: { type: 'commandExecution', id: 'c1', command: 'git status' } });
    expect(started).toEqual([{ type: 'toolStarted', toolId: 'c1', name: 'Comando', detail: 'git status' }]);
    const completed = mapCodexNotification('item/completed', {
      item: { type: 'commandExecution', id: 'c1', command: 'git status', exitCode: 128, aggregatedOutput: 'fatal' },
    });
    expect(completed).toEqual([{ type: 'toolCompleted', toolId: 'c1', status: 'failed', output: 'fatal' }]);
  });

  it('reports file changes with their diff', () => {
    const [event] = mapCodexNotification('item/completed', {
      item: { type: 'fileChange', id: 'f1', status: 'completed', changes: [{ path: 'a.gd', kind: 'add', diff: '+x' }] },
    });
    expect(event).toEqual({ type: 'fileChange', paths: ['a.gd'], diff: '+x' });
  });

  it('reports a generated image by its saved path', () => {
    const [event] = mapCodexNotification('item/completed', {
      item: { type: 'imageGeneration', id: 'i1', status: 'completed', savedPath: 'C:\\img.png', revisedPrompt: 'madeira' },
    });
    expect(event).toEqual({ type: 'image', path: 'C:\\img.png', prompt: 'madeira' });
  });

  it('adds an error before the end of a failed turn', () => {
    expect(mapCodexNotification('turn/completed', { turn: { status: 'failed', error: { message: 'sem cota' } } })).toEqual([
      { type: 'error', message: 'sem cota' },
      { type: 'turnCompleted', status: 'failed' },
    ]);
  });
});

describe('mapCodexRateLimits', () => {
  it('uses the window duration to tell the 5h window from the week', () => {
    const usage = mapCodexRateLimits({
      primary: { usedPercent: 31, windowDurationMins: 10080, resetsAt: 1795141184 },
      secondary: { usedPercent: 9, windowDurationMins: 300, resetsAt: 1794712224 },
    });
    expect(usage.fiveHour).toEqual({ usedPercent: 9, resetsAt: 1794712224000 });
    expect(usage.week).toEqual({ usedPercent: 31, resetsAt: 1795141184000 });
  });
});
