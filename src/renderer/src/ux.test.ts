import { describe, expect, it } from 'vitest';
import type { ApprovalRequest, ScheduleInput, StoredEntry } from '@shared/types';
import { effortLabel, mentionOptions, mentionTarget, permissionNotice, readableError, scheduleDraftError, toolLabel, turnActivity } from './ux';

function entry(value: Record<string, unknown>): StoredEntry {
  return { id: 'example', chatId: 'chat', createdAt: 1, ...value } as StoredEntry;
}
const user = entry({ kind: 'user', text: 'Next task', attachments: [] });
const tool = (agent: string, status = 'running', name = 'Comando') => entry({ kind: 'tool', agent, name, status, toolId: agent, detail: 'example' });

describe('current turn presentation', () => {
  it('prioritizes the agent waiting for a decision over streamed text', () => {
    const request: ApprovalRequest = { id: 'approval', chatId: 'chat', agent: 'codex', kind: 'command', title: 'Example', detail: 'Example' };
    expect(turnActivity('auto', true, [user], { agent: 'claude', text: 'Thinking' }, [request])).toMatchObject({ agent: 'codex', kind: 'approval' });
  });
  it('shows Codex while its delegated tool runs, then Claude while integration is pending', () => {
    const parent = tool('claude', 'running', 'mcp__contraponto__delegate_to_codex');
    expect(turnActivity('auto', true, [user, parent, tool('codex')])).toMatchObject({ agent: 'codex', title: 'Executando comando' });
    expect(turnActivity('auto', true, [user, parent, tool('codex', 'done')])).toMatchObject({ agent: 'claude' });
  });
  it('ignores stale running tools from earlier turns', () => {
    expect(turnActivity('codex', true, [tool('claude'), user])).toMatchObject({ agent: 'codex', title: 'Preparando a resposta' });
  });
  it('identifies an actual streamed response in automatic mode', () => {
    expect(turnActivity('auto', true, [user], { agent: 'codex', text: 'Result' })).toMatchObject({ agent: 'codex', title: 'Escrevendo a resposta' });
  });
  it('uses the forced mention before the first streamed token', () => {
    expect(turnActivity('claude', true, [entry({ kind: 'user', text: '@Codex confira isto', attachments: [] })]).agent).toBe('codex');
  });
  it('uses the existing quota notice when automatic mode switches to Codex', () => {
    expect(turnActivity('auto', true, [user, entry({ kind: 'notice', text: 'O Claude está com cota alta. O Codex assume esta mensagem.' })]).agent).toBe('codex');
  });
  it('distinguishes a folder queue from active work', () => {
    expect(turnActivity('codex', true, [user, entry({ kind: 'notice', text: 'Outra conversa está trabalhando nesta pasta.' })])).toMatchObject({ kind: 'queued' });
  });
  it.each(['failed', 'interrupted'])('keeps the outcome of a %s turn visible', (status) => {
    const activity = turnActivity('auto', false, [entry({ kind: 'turnEnd', agent: 'codex', status })]);
    expect(activity.kind).toBe('idle'); expect(activity.agent).toBe('codex'); expect(activity.title).not.toContain('Pronto');
  });
  it.each([['Comando', 'Executando comando'], ['apply_patch', 'Alterando arquivos'], ['Read', 'Consultando o projeto']])('names the real tool %s in plain language', (name, expected) => {
    expect(toolLabel(name)).toBe(expected);
  });
});

describe('mentions and recoverable errors', () => {
  it.each([['low', 'Baixo'], ['medium', 'Médio'], ['high', 'Alto'], ['xhigh', 'Muito alto'], ['max', 'Máximo'], ['ultra', 'Ultra'], ['future', 'future']])
    ('presents effort %s without changing its protocol value', (value, expected) => expect(effortLabel(value)).toBe(expected));
  it.each([['ask', 'Você aprova as ações'], ['acceptEdits', 'Edições sem perguntar'], ['full', 'Sem pedir aprovação']] as const)
    ('describes the actual %s permission level', (level, expected) => expect(permissionNotice(level)).toBe(expected));
  it('previews only an unambiguous agent mention, as the router does', () => {
    expect(mentionTarget('Peça ao @Codex.')).toBe('codex');
    expect(mentionTarget('@CLAUDE leia isto')).toBe('claude');
    expect(mentionTarget('@Claude e @Codex')).toBeNull();
    expect(mentionTarget('@CodexOther')).toBeNull();
  });
  it('offers completion at the cursor without consuming the rest of the draft', () => {
    expect(mentionOptions('Olhe @co depois', 8)).toEqual({ start: 5, options: ['Codex'] });
    expect(mentionOptions('@', 1)?.options).toEqual(['Claude', 'Codex']);
    expect(mentionOptions('arquivo@co', 10)).toBeNull();
  });
  it('removes Electron transport noise while preserving the actionable error', () => {
    expect(readableError(new Error("Error invoking remote method 'cp:sendMessage': Error: Este chat ainda está respondendo.")))
      .toBe('Este chat ainda está respondendo.');
  });
});

describe('schedule form feedback', () => {
  const draft: ScheduleInput = { name: 'Review', projectId: 'project', prompt: 'Review the changes', chatId: null, continueChat: false,
    trigger: { kind: 'interval', minutes: 1 }, settings: { agent: 'codex', claudeModel: null, claudeEffort: null, codexModel: null, codexEffort: null, permissionLevel: 'ask' } };
  it('accepts a valid task without changing its configuration', () => {
    expect(scheduleDraftError(draft, 1000)).toBeNull(); expect(draft.settings.agent).toBe('codex');
  });
  it('explains why a selected conversation is required', () => {
    expect(scheduleDraftError({ ...draft, continueChat: true })).toBe('Escolha a conversa que deve continuar.');
  });
  it('rejects invalid intervals and expired dates before submitting', () => {
    expect(scheduleDraftError({ ...draft, trigger: { kind: 'interval', minutes: 0 } })).toContain('intervalo');
    expect(scheduleDraftError({ ...draft, trigger: { kind: 'once', at: 1000 } }, 1000)).toContain('futuro');
  });
  it('explains cron field counts and invalid timezones in Portuguese', () => {
    expect(scheduleDraftError({ ...draft, trigger: { kind: 'cron', expression: '* * *', timezone: 'UTC' } })).toContain('5 campos');
    expect(scheduleDraftError({ ...draft, trigger: { kind: 'cron', expression: '0 9 * * *', timezone: 'Invalid/Zone' } })).toContain('fuso válido');
  });
});
