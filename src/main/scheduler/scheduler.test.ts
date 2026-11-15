import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ScheduleInput } from '@shared/types';
import { Store } from '../storage/store';
import { Scheduler } from './scheduler';
import { nextOccurrence, validateSchedule } from './schedule';

const base = Date.parse('2026-11-15T12:00:00Z');
const stores: Store[] = [];
const folders: string[] = [];
afterEach(() => { stores.splice(0).forEach((store) => store.close()); folders.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })); });
function setup(run?: ConstructorParameters<typeof Scheduler>[1], database = ':memory:') {
  const store = new Store(database); stores.push(store);
  const project = store.addProject('C:\\Phase4Test');
  let now = base;
  let starts = 0;
  const stopped: number[] = [];
  const calls: string[] = [];
  const scheduler = new Scheduler(store, run ?? (async (schedule) => { calls.push(schedule.id); return { chatId: 'result', status: 'completed' }; }),
    { start: () => ++starts, stop: (id) => { stopped.push(id); } }, () => {}, () => now);
  const input: ScheduleInput = { name: 'Daily review', projectId: project.id, prompt: 'Review the project', continueChat: false, chatId: null,
    trigger: { kind: 'interval', minutes: 1 }, settings: { agent: 'auto', claudeModel: 'sonnet', claudeEffort: 'high', codexModel: 'gpt-6.1-sol', codexEffort: 'low', permissionLevel: 'ask' } };
  return { store, project, scheduler, input, calls, stopped, starts: () => starts, time: (value: number) => { now = value; } };
}

describe('schedule deadlines', () => {
  it('interprets a cron expression in Sao Paulo instead of the host timezone', () => {
    expect(nextOccurrence({ kind: 'cron', expression: '0 9 * * *', timezone: 'America/Sao_Paulo' }, Date.parse('2026-11-15T11:59:00Z')))
      .toBe(Date.parse('2026-11-15T12:00:00Z'));
  });
  it('keeps the local cron hour across a daylight saving change', () => {
    expect(nextOccurrence({ kind: 'cron', expression: '0 9 * * *', timezone: 'America/New_York' }, Date.parse('2026-03-07T14:00:00Z')))
      .toBe(Date.parse('2026-03-08T13:00:00Z'));
  });
  it('rejects seconds, invalid timezones, invalid intervals and expired one-offs', () => {
    const { input } = setup();
    for (const trigger of [
      { kind: 'cron', expression: '* * * * * *', timezone: 'UTC' },
      { kind: 'cron', expression: '* * * * *', timezone: 'Invalid/Zone' },
      { kind: 'interval', minutes: 0 }, { kind: 'interval', minutes: 1.5 }, { kind: 'once', at: base },
    ]) expect(() => validateSchedule({ ...input, trigger }, base)).toThrow();
  });
});

describe('Scheduler with real SQLite persistence', () => {
  it('runs once at the deadline and persists the result and selected models', async () => {
    const s = setup();
    s.scheduler.save(s.input);
    await s.scheduler.tick(); expect(s.calls).toHaveLength(0);
    s.time(base + 60000); await s.scheduler.tick();
    expect(s.calls).toHaveLength(1);
    expect(s.store.listSchedules()[0]).toMatchObject({ lastStatus: 'completed', lastChatId: 'result', nextRunAt: base + 120000, settings: s.input.settings });
    expect(s.stopped).toEqual([1]);
  });
  it('coalesces missed intervals on resume and prevents duplicate concurrent ticks', async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    let calls = 0;
    const s = setup(async () => { calls++; await gate; return { chatId: 'one', status: 'completed' }; });
    s.scheduler.save(s.input); s.time(base + 600000);
    const running = s.scheduler.tick();
    await s.scheduler.tick();
    expect(calls).toBe(1); expect(s.starts()).toBe(1); expect(s.stopped).toEqual([]);
    finish(); await running;
    await s.scheduler.tick(); expect(calls).toBe(1);
    expect(s.store.listSchedules()[0].nextRunAt).toBe(base + 660000);
  });
  it('disables a one-off after claiming it and never repeats it', async () => {
    const s = setup(); s.scheduler.save({ ...s.input, trigger: { kind: 'once', at: base + 60000 } });
    s.time(base + 60000); await s.scheduler.tick(); s.time(base + 86400000); await s.scheduler.tick();
    expect(s.calls).toHaveLength(1); expect(s.store.listSchedules()[0]).toMatchObject({ enabled: false, nextRunAt: null });
  });
  it('records failures and releases the power blocker', async () => {
    const s = setup(async () => { throw new Error('Runner unavailable'); });
    s.scheduler.save(s.input); s.time(base + 60000); await s.scheduler.tick();
    expect(s.store.listSchedules()[0]).toMatchObject({ lastStatus: 'failed', lastError: 'Runner unavailable' });
    expect(s.stopped).toEqual([1]);
  });
  it('pauses and deletes without resurrecting a task that is finishing', async () => {
    let finish!: () => void;
    const s = setup(async () => { await new Promise<void>((resolve) => { finish = resolve; }); return { chatId: 'one', status: 'completed' }; });
    const task = s.scheduler.save(s.input); s.time(base + 60000); const running = s.scheduler.tick();
    s.scheduler.pause(task.id, true); finish(); await running;
    expect(s.store.listSchedules()[0].enabled).toBe(false);
    s.scheduler.delete(task.id); expect(s.store.listSchedules()).toEqual([]);
  });
  it('does not restore a deleted task after its active run completes', async () => {
    let finish!: () => void;
    const s = setup(async () => { await new Promise<void>((resolve) => { finish = resolve; }); return { chatId: 'one', status: 'completed' }; });
    const task = s.scheduler.save(s.input); s.time(base + 60000); const running = s.scheduler.tick();
    s.scheduler.delete(task.id); finish(); await running;
    expect(s.store.listSchedules()).toEqual([]); expect(s.stopped).toEqual([1]);
  });
  it('validates that a continued chat belongs to the selected project', () => {
    const s = setup(); const other = s.store.addProject('C:\\Other'); const chat = s.store.createChat(other.id);
    expect(() => s.scheduler.save({ ...s.input, continueChat: true, chatId: chat.id })).toThrow('pertencer');
  });
  it('persists overdue deadlines across app restarts', async () => {
    const folder = mkdtempSync(path.join(os.tmpdir(), 'cp-scheduler-')); folders.push(folder);
    const database = path.join(folder, 'store.db');
    const s = setup(undefined, database); const task = s.scheduler.save(s.input); s.store.close(); stores.splice(stores.indexOf(s.store), 1);
    const restarted = setup(undefined, database); restarted.time(base + 3600000); await restarted.scheduler.tick();
    expect(restarted.calls).toEqual([task.id]);
  });
  it('marks an interrupted claimed run without replaying the same one-off', async () => {
    const s = setup(); const task = s.scheduler.save({ ...s.input, trigger: { kind: 'once', at: base + 60000 } });
    s.store.saveSchedule({ ...task, enabled: false, nextRunAt: null, lastStatus: 'running' });
    s.scheduler.start(); s.scheduler.stop();
    expect(s.store.listSchedules()[0].lastStatus).toBe('interrupted'); expect(s.calls).toEqual([]);
  });
});
