import { describe, expect, it } from 'vitest';
import type { Store } from '../storage/store';
import { UsageService } from './usage-service';

function service() {
  const settings = new Map<string, unknown>();
  const store = { getSetting: (key: string) => settings.get(key), setSetting: (key: string, value: unknown) => settings.set(key, value) } as unknown as Store;
  return new UsageService(store, () => {});
}

describe('UsageService', () => {
  it('reports agents whose window has passed its reset time', () => {
    const usage = service();
    usage.update('claude', { fiveHour: { usedPercent: 100, resetsAt: 1000 }, week: { usedPercent: 43, resetsAt: 9000 }, observedAt: 0 });
    usage.update('codex', { fiveHour: { usedPercent: 55, resetsAt: 5000 }, week: null, observedAt: 0 });
    expect(usage.stale(999)).toEqual([]);
    expect(usage.stale(1000)).toEqual(['claude']);
  });

  it('keeps a known window missing from a partial report', () => {
    const usage = service();
    usage.update('claude', { fiveHour: { usedPercent: 40, resetsAt: 5000 }, week: null, observedAt: 0 });
    usage.update('claude', { fiveHour: null, week: { usedPercent: 10, resetsAt: 9000 }, observedAt: 100 });
    expect(usage.list()[0].fiveHour).toEqual({ usedPercent: 40, resetsAt: 5000 });
  });

  it('drops a window that already reset when the fresh report omits it', () => {
    const usage = service();
    usage.update('claude', { fiveHour: { usedPercent: 100, resetsAt: 1000 }, week: null, observedAt: 0 });
    usage.update('claude', { fiveHour: null, week: { usedPercent: 43, resetsAt: 9000 }, observedAt: 2000 });
    expect(usage.list()[0].fiveHour).toBeNull();
    expect(usage.stale(2000)).toEqual([]);
  });
});
