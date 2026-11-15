import type { AgentId, AgentMode, ApprovalRequest, PermissionLevel, ScheduleInput, StoredEntry } from '@shared/types';

export type Draft = { text: string; attachments: import('@shared/types').Attachment[] };
export type DraftUpdate = Draft | ((current: Draft) => Draft);
export const EMPTY_DRAFT: Draft = { text: '', attachments: [] };

export function permissionNotice(level: PermissionLevel): string {
  return level === 'full' ? 'Sem pedir aprovação' : level === 'acceptEdits' ? 'Pergunta só o que for arriscado' : 'Você aprova as ações';
}

export function effortLabel(value: string): string {
  return ({ low: 'Baixo', medium: 'Médio', high: 'Alto', xhigh: 'Muito alto', max: 'Máximo', ultra: 'Ultra' } as Record<string, string>)[value] ?? value;
}

export function readableError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

/** Describe the current turn from existing events; never infer work from old turns. */
export function turnActivity(mode: AgentMode, running: boolean, entries: StoredEntry[] = [],
  live?: { agent: AgentId; text: string }, approvals: ApprovalRequest[] = [], background: string[] = []) {
  const lastUser = entries.findLastIndex((entry) => entry.kind === 'user');
  const prompt = entries[lastUser];
  const current = entries.slice(lastUser + 1);
  const routedToCodex = current.some((entry) => entry.kind === 'notice' && entry.text.includes('O Codex assume esta mensagem'));
  const leader: AgentId = (running && prompt?.kind === 'user' ? mentionTarget(prompt.text) : null)
    ?? (running && routedToCodex ? 'codex' : mode === 'codex' ? 'codex' : 'claude');
  if (approvals.length) return { agent: approvals[0].agent, kind: 'approval', title: 'Precisa da sua aprovação', detail: 'Confira o pedido e escolha permitir ou negar.' } as const;
  // Only Claude reports background work (shells, subagents, resuming after them).
  if (!running && background.length) return { agent: 'claude', kind: 'background', title: 'Ainda trabalhando em segundo plano', detail: background.join(' · ') } as const;
  if (!running) {
    const end = entries.filter((entry) => entry.kind === 'turnEnd').at(-1);
    if (end?.kind === 'turnEnd' && ['failed', 'interrupted'].includes(end.status)) {
      return { agent: end.agent, kind: 'idle', title: end.status === 'failed' ? 'Turno encerrado com erro' : 'Turno interrompido', detail: 'Confira o resultado antes de enviar outra mensagem.' } as const;
    }
    return { agent: leader, kind: 'ready', title: 'Pronto para sua próxima mensagem', detail: mode === 'auto' ? 'Claude lidera; Codex recebe as tarefas delegadas.' : `A próxima mensagem vai para o ${leader === 'claude' ? 'Claude' : 'Codex'}.` } as const;
  }
  const tool = current.filter((entry) => entry.kind === 'tool' && entry.status === 'running').at(-1);
  if (live?.text) return { agent: live.agent, kind: 'working', title: 'Escrevendo a resposta', detail: 'Você pode acompanhar abaixo ou parar o turno.' } as const;
  if (tool?.kind === 'tool') return { agent: tool.agent, kind: 'working', title: toolLabel(tool.name), detail: 'A execução está em andamento. Os detalhes ficam no chat.' } as const;
  const latest = current.at(-1);
  if (latest?.kind === 'notice' && latest.text.includes('Outra conversa')) {
    return { agent: leader, kind: 'queued', title: 'Na fila desta pasta', detail: 'Este turno começa quando a outra conversa terminar.' } as const;
  }
  return { agent: leader, kind: 'working', title: 'Preparando a resposta', detail: 'O turno começou. Você pode pará-lo a qualquer momento.' } as const;
}

export type WorkEntry = Extract<StoredEntry, { kind: 'tool' | 'fileChange' }>;
/** endAt: when the next entry arrived, i.e. when this run of work stopped. */
export type ChatBlock = { kind: 'entry'; entry: StoredEntry } | { kind: 'work'; id: string; items: WorkEntry[]; endAt: number | null };

/** Consecutive tool calls and file changes collapse into one block, so they don't flood the chat. */
export function groupWork(entries: StoredEntry[]): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  for (const entry of entries) {
    const last = blocks.at(-1);
    if (entry.kind === 'tool' || entry.kind === 'fileChange') {
      if (last?.kind === 'work') last.items.push(entry);
      else blocks.push({ kind: 'work', id: entry.id, items: [entry], endAt: null });
    } else {
      if (last?.kind === 'work') last.endAt = entry.createdAt;
      blocks.push({ kind: 'entry', entry });
    }
  }
  return blocks;
}

export function workSummary(items: WorkEntry[]): { text: string; failed: number } {
  const tools = items.filter((item) => item.kind === 'tool');
  const files = new Set(items.flatMap((item) => (item.kind === 'fileChange' ? item.paths : [])));
  const parts: string[] = [];
  if (tools.length) parts.push(`${tools.length} ${tools.length === 1 ? 'ação' : 'ações'}`);
  if (files.size) parts.push(`${files.size} ${files.size === 1 ? 'arquivo alterado' : 'arquivos alterados'}`);
  return { text: parts.join(' · '), failed: tools.filter((item) => item.status === 'failed').length };
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes} min ${seconds % 60} s` : `${seconds} s`;
}

export function toolLabel(name: string): string {
  if (/delegate_to_codex/.test(name)) return 'Delegando uma tarefa ao Codex';
  if (/command|comando|bash|powershell|exec/i.test(name)) return 'Executando comando';
  if (/write|edit|patch|filechange|arquivo/i.test(name)) return 'Alterando arquivos';
  if (/read|search|glob|grep/i.test(name)) return 'Consultando o projeto';
  return 'Usando uma ferramenta';
}

/** Match the router's single-agent mention rule without changing its decision. */
export function mentionTarget(text: string): AgentId | null {
  const claude = /@claude\b/i.test(text), codex = /@codex\b/i.test(text);
  return claude === codex ? null : claude ? 'claude' : 'codex';
}

export function mentionOptions(text: string, cursor: number): { start: number; options: string[] } | null {
  const match = text.slice(0, cursor).match(/(?:^|\s)@([a-z]*)$/i);
  if (!match) return null;
  const options = ['Claude', 'Codex'].filter((name) => name.toLowerCase().startsWith(match[1].toLowerCase()));
  return options.length ? { start: cursor - match[1].length - 1, options } : null;
}

export function scheduleDraftError(draft: ScheduleInput, now = Date.now()): string | null {
  if (!draft.name.trim()) return 'Dê um nome ao agendamento.';
  if (!draft.prompt.trim()) return 'Escreva a mensagem que a IA deve executar.';
  if (draft.continueChat && !draft.chatId) return 'Escolha a conversa que deve continuar.';
  if (draft.trigger.kind === 'interval' && (!Number.isInteger(draft.trigger.minutes) || draft.trigger.minutes < 1 || draft.trigger.minutes > 525600)) return 'Informe um intervalo de 1 a 525600 minutos.';
  if (draft.trigger.kind === 'once' && (!Number.isFinite(draft.trigger.at) || draft.trigger.at <= now)) return 'Escolha uma data e hora no futuro.';
  if (draft.trigger.kind === 'cron') {
    if (draft.trigger.expression.trim().split(/\s+/).length !== 5) return 'O cron precisa de 5 campos: minuto, hora, dia, mês e dia da semana.';
    try { new Intl.DateTimeFormat('pt-BR', { timeZone: draft.trigger.timezone }).format(now); }
    catch { return 'Informe um fuso válido, como America/Sao_Paulo.'; }
  }
  return null;
}
