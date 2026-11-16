import { describe, expect, it } from 'vitest';
import { quotaPercent, quotaReset, quotaResetDate } from './usage';

const now = Date.UTC(2026, 10, 15, 20);
describe('plan quota presentation', () => {
  it('keeps unavailable usage distinct from zero usage', () => {
    expect(quotaPercent(null)).toBeNull();
    expect(quotaPercent({ usedPercent: 0, resetsAt: null })).toBe(0);
    expect(quotaPercent({ usedPercent: NaN, resetsAt: null })).toBeNull();
  });
  it('clamps percentages to the displayed progress range', () => {
    expect(quotaPercent({ usedPercent: 120, resetsAt: null })).toBe(100);
    expect(quotaPercent({ usedPercent: -3, resetsAt: null })).toBe(0);
  });
  it('does not invent a reset time or an unstarted window from zero percent', () => {
    expect(quotaReset(null, now)).toBe('Uso não informado');
    expect(quotaReset({ usedPercent: 0, resetsAt: null }, now)).toBe('Renovação não informada');
    expect(quotaResetDate({ usedPercent: 0, resetsAt: NaN })).toBeNull();
  });
  it('marks expired reports as awaiting fresh data instead of resetting their usage', () => {
    expect(quotaReset({ usedPercent: 78, resetsAt: now - 1 }, now)).toBe('Aguardando atualização');
  });
  it.each([[1, 'Renova em 1 min'], [102, 'Renova em 1h 42min'], [120, 'Renova em 2h'], [3000, 'Renova em 2d 2h']])('formats %i minutes until renewal', (minutes, expected) => {
    expect(quotaReset({ usedPercent: 40, resetsAt: now + minutes * 60000 }, now)).toBe(expected);
  });
  it('provides a local date only for a reported renewal', () => {
    expect(quotaResetDate(null)).toBeNull();
    expect(quotaResetDate({ usedPercent: 20, resetsAt: now })).toEqual(expect.any(String));
  });
});
