import { describe, expect, it } from 'vitest';
import type { TimelineEntry } from '../storage/store';
import { buildCrossSummary } from './timeline';

function entry(agent: string, prompt: string, files: string[] = [], extra: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    id: prompt,
    projectId: 'p',
    chatId: 'c',
    agent,
    prompt,
    result: `fiz ${prompt}`,
    files,
    beforeRef: 'a',
    afterRef: 'b',
    undone: false,
    createdAt: Date.UTC(2026, 10, 15, 15, 30),
    ...extra,
  };
}

describe('buildCrossSummary', () => {
  it('returns nothing when the other agent did nothing since the last own turn', () => {
    const timeline = [entry('codex', 'textura'), entry('claude', 'script')];
    expect(buildCrossSummary(timeline, 'claude', [])).toBeNull();
  });

  it('lists only what the other agent did after the last own turn', () => {
    const timeline = [entry('codex', 'antiga'), entry('claude', 'script'), entry('codex', 'textura', ['assets/madeira.png'])];
    const summary = buildCrossSummary(timeline, 'claude', [])!;
    expect(summary).toContain('Codex');
    expect(summary).toContain('pedido "textura"');
    expect(summary).toContain('assets/madeira.png');
    expect(summary).not.toContain('antiga');
  });

  it('includes changes made outside the agents and undone turns', () => {
    const timeline = [entry('claude', 'porta', ['door.gd'], { undone: true })];
    const summary = buildCrossSummary(timeline, 'codex', ['scenes/main.tscn'])!;
    expect(summary).toContain('depois desfeito pelo usuário');
    expect(summary).toContain('Alterados fora das IAs');
    expect(summary).toContain('scenes/main.tscn');
  });

  it('gives a new agent the full recent history', () => {
    const timeline = [entry('claude', 'um'), entry('claude', 'dois')];
    const summary = buildCrossSummary(timeline, 'codex', [])!;
    expect(summary).toContain('pedido "um"');
    expect(summary).toContain('pedido "dois"');
  });
});
