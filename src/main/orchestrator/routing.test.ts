import { describe, expect, it } from 'vitest';
import type { AgentUsage } from '@shared/types';
import { DEFAULT_SETTINGS, decideRoute, routingInstructions } from './routing';

const usage = (claude: number, codex: number): AgentUsage[] => [
  { agent: 'claude', fiveHour: { usedPercent: claude, resetsAt: null }, week: { usedPercent: 10, resetsAt: null }, observedAt: 0 },
  { agent: 'codex', fiveHour: { usedPercent: codex, resetsAt: null }, week: { usedPercent: 10, resetsAt: null }, observedAt: 0 },
];

describe('decideRoute', () => {
  it('lets an @mention override the selector for that message', () => {
    expect(decideRoute('auto', 'Faça a textura @Codex', usage(10, 10), DEFAULT_SETTINGS).agent).toBe('codex');
    expect(decideRoute('codex', '@claude revise o script', usage(10, 10), DEFAULT_SETTINGS)).toMatchObject({ agent: 'claude', delegate: false });
  });

  it('uses the selected agent outside automatic mode, even over quota', () => {
    expect(decideRoute('claude', 'oi', usage(99, 10), DEFAULT_SETTINGS)).toEqual({ agent: 'claude', delegate: false, codexBlocked: false });
  });

  it('makes Claude the leader in automatic mode', () => {
    expect(decideRoute('auto', 'crie um baú', usage(10, 10), DEFAULT_SETTINGS)).toEqual({ agent: 'claude', delegate: true, codexBlocked: false });
  });

  it('hands the message to Codex when Claude passes the threshold', () => {
    const route = decideRoute('auto', 'crie um baú', usage(92, 10), DEFAULT_SETTINGS);
    expect(route).toMatchObject({ agent: 'codex', delegate: false });
    expect(route.notice).toContain('92%');
  });

  it('keeps Claude once its full window has passed the reset time', () => {
    const [claude, codex] = usage(100, 10);
    const expired = [{ ...claude, fiveHour: { usedPercent: 100, resetsAt: 1000 } }, codex];
    expect(decideRoute('auto', 'crie um baú', expired, DEFAULT_SETTINGS, 999).agent).toBe('codex');
    expect(decideRoute('auto', 'crie um baú', expired, DEFAULT_SETTINGS, 1000)).toMatchObject({ agent: 'claude', delegate: true });
  });

  it('blocks delegation when Codex passes the threshold', () => {
    expect(decideRoute('auto', 'crie um baú', usage(10, 95), DEFAULT_SETTINGS)).toMatchObject({ agent: 'claude', delegate: true, codexBlocked: true });
  });

  it('does nothing with quota when the switch is off', () => {
    const settings = { ...DEFAULT_SETTINGS, quotaSwitch: { enabled: false, threshold: 90 } };
    expect(decideRoute('auto', 'crie um baú', usage(99, 99), settings)).toEqual({ agent: 'claude', delegate: true, codexBlocked: false });
  });
});

describe('routingInstructions', () => {
  it('lists every rule with who does it', () => {
    const text = routingInstructions(DEFAULT_SETTINGS.routingRules);
    expect(text).toContain('- Texturas e imagens: Codex');
    expect(text).toContain('- Bugs e testes: você (Claude)');
    expect(text).toContain('delegate_to_codex');
  });
});
