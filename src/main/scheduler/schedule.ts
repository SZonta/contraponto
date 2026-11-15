import { CronExpressionParser } from 'cron-parser';
import { z } from 'zod';
import type { ScheduleInput, ScheduleTrigger } from '@shared/types';

const nullableText = z.string().max(200).nullable();
const schema = z.object({
  name: z.string().trim().min(1).max(100),
  projectId: z.string().min(1),
  prompt: z.string().trim().min(1).max(20000),
  continueChat: z.boolean(),
  chatId: z.string().nullable(),
  trigger: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('cron'), expression: z.string().trim(), timezone: z.string().trim() }),
    z.object({ kind: z.literal('interval'), minutes: z.number().int().min(1).max(525600) }),
    z.object({ kind: z.literal('once'), at: z.number().int().positive() }),
  ]),
  settings: z.object({
    agent: z.enum(['claude', 'codex', 'auto']),
    claudeModel: nullableText, claudeEffort: nullableText,
    codexModel: nullableText, codexEffort: nullableText,
    permissionLevel: z.enum(['ask', 'acceptEdits', 'full']),
  }),
});

export function nextOccurrence(trigger: ScheduleTrigger, after: number): number | null {
  if (trigger.kind === 'once') return trigger.at > after ? trigger.at : null;
  if (trigger.kind === 'interval') return after + trigger.minutes * 60000;
  return CronExpressionParser.parse(trigger.expression, { currentDate: new Date(after), tz: trigger.timezone }).next().getTime();
}

export function validateSchedule(input: unknown, now: number): ScheduleInput {
  const clean = schema.parse(input);
  if (clean.continueChat && !clean.chatId) throw new Error('Escolha o chat que será continuado.');
  if (clean.trigger.kind === 'cron') {
    if (clean.trigger.expression.split(/\s+/).length !== 5) throw new Error('Use cron com 5 campos: minuto hora dia mês dia-da-semana.');
    new Intl.DateTimeFormat('pt-BR', { timeZone: clean.trigger.timezone }).format(now);
  }
  if (nextOccurrence(clean.trigger, now) === null) throw new Error('Escolha uma data no futuro.');
  return { ...clean, chatId: clean.continueChat ? clean.chatId : null };
}
