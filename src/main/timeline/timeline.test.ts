import { describe, expect, it } from 'vitest';
import type { TimelineEntry } from '../storage/store';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../storage/store';
import { buildCrossSummary, Timeline } from './timeline';

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

describe('Timeline checkpoint budget', () => {
  it('keeps only the last turn when a project goes over its budget, and says so when even that is over', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'cp-budget-'));
    const store = new Store(':memory:');
    try {
      const folder = path.join(root, 'game');
      mkdirSync(folder);
      const project = store.addProject(folder);
      const turn = async (timeline: Timeline, index: number) => {
        const beforeRef = await timeline.begin(project);
        writeFileSync(path.join(folder, 'asset.bin'), randomBytes(100_000));
        return timeline.finish(project, { chatId: 'c', agent: 'codex', prompt: `p${index}`, result: 'r', beforeRef });
      };
      const roomy = new Timeline(store, (id) => path.join(root, `${id}.git`), 250_000);
      for (let index = 0; index < 2; index++) expect((await turn(roomy, index)).overBudgetBytes).toBeUndefined();
      const third = await turn(roomy, 2);
      expect(third.overBudgetBytes).toBeUndefined();
      const tight = new Timeline(store, (id) => path.join(root, `${id}.git`), 10_000);
      expect((await turn(tight, 3)).overBudgetBytes).toBeGreaterThan(10_000);
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
