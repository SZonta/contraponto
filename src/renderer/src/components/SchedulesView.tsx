import { useEffect, useState } from 'react';
import type { AgentId, AgentMode, Chat, Schedule, ScheduleInput, ScheduleTrigger } from '@shared/types';
import type { useAppState } from '../useAppState';
import { api, MODE_LABELS } from '../lib';

type State = ReturnType<typeof useAppState>;
const fieldClass = 'w-full rounded border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-codex';
const dateLabel = (time: number | null) => time ? new Date(time).toLocaleString('pt-BR') : '—';
const statuses = { idle: 'Aguardando', running: 'Executando', completed: 'Concluído', failed: 'Falhou', interrupted: 'Interrompido' };

function fresh(projectId: string): ScheduleInput {
  return { name: '', projectId, prompt: '', trigger: { kind: 'interval', minutes: 60 }, continueChat: false, chatId: null,
    settings: { agent: 'claude', claudeModel: null, claudeEffort: null, codexModel: null, codexEffort: null, permissionLevel: 'ask' } };
}

function triggerLabel(trigger: ScheduleTrigger): string {
  if (trigger.kind === 'interval') return `A cada ${trigger.minutes} min`;
  if (trigger.kind === 'once') return `Uma vez · ${dateLabel(trigger.at)}`;
  return `${trigger.expression} · ${trigger.timezone}`;
}

export function SchedulesView({ state }: { state: State }) {
  const [editor, setEditor] = useState<ScheduleInput | null>(null);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const act = async (action: () => Promise<unknown>) => {
    try { setError(null); await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  return (
    <div className="flex-1 overflow-y-auto px-7 py-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-start justify-between gap-5">
          <div><h1 className="text-xl font-semibold">Trabalho no seu ritmo</h1>
            <p className="mt-2 max-w-xl text-sm text-muted">Programe um pedido para as IAs. O Contraponto precisa estar aberto, inclusive na bandeja.</p></div>
          <button disabled={!state.projects.length} onClick={() => { setEditingId(undefined); setEditor(fresh(state.projectId ?? state.projects[0].id)); }}
            className="shrink-0 rounded bg-codex px-4 py-2 font-semibold text-ink disabled:opacity-40">+ Novo agendamento</button>
        </div>
        <p className="mt-4 rounded border border-line bg-panel px-4 py-3 text-xs leading-relaxed text-muted">
          Ao voltar da suspensão, cada tarefa atrasada roda uma vez. A fila respeita o trabalho em andamento na pasta.
          Pedidos de aprovação continuam valendo; pausar não interrompe um turno que já começou.
        </p>
        {error && <p role="alert" className="mt-4 text-red-400">{error}</p>}
        {!state.schedules.length && <div className="mt-12 rounded-lg border border-dashed border-line p-10 text-center text-muted">Nenhum agendamento ainda. Comece com uma tarefa curta.</div>}
        <div className="mt-6 grid gap-3">
          {state.schedules.map((item) => <article key={item.id} className="rounded-lg border border-line bg-panel p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0"><h2 className="truncate font-semibold">{item.name} <span className={`ml-2 text-xs font-normal ${item.enabled ? 'text-codex' : 'text-muted'}`}>{item.enabled ? 'Ativo' : 'Pausado'}</span></h2>
                <p className="mt-1 text-xs text-muted">{state.projects.find((project) => project.id === item.projectId)?.name} · {MODE_LABELS[item.settings.agent]} · {triggerLabel(item.trigger)}</p>
                <p className="mt-3 line-clamp-2 whitespace-pre-wrap text-sm text-muted">{item.prompt}</p></div>
              <div className="flex shrink-0 gap-3 text-xs">
                <button onClick={() => { setEditingId(item.id); setEditor(item); }} className="hover:text-codex">Editar</button>
                <button onClick={() => void act(() => api.pauseSchedule(item.id, item.enabled))} className="hover:text-codex">{item.enabled ? 'Pausar' : 'Ativar'}</button>
                <button onClick={() => { if (confirm(`Apagar o agendamento "${item.name}"? Os chats serão preservados.`)) void act(() => api.deleteSchedule(item.id)); }} className="text-muted hover:text-red-400">Apagar</button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3 text-xs text-muted">
              <span>Próxima: {item.enabled ? dateLabel(item.nextRunAt) : 'pausado'}</span>
              <span>Última: {dateLabel(item.lastRunAt)} · {statuses[item.lastStatus]}</span>
              {item.lastChatId && <button onClick={() => state.openChat(item.projectId, item.lastChatId!)} className="ml-auto text-codex">Ver resultado →</button>}
            </div>
            {item.lastError && <p className="mt-2 text-xs text-red-400">{item.lastError}</p>}
          </article>)}
        </div>
      </div>
      {editor && <ScheduleEditor key={editingId ?? 'new'} initial={editor} id={editingId} state={state} onClose={() => setEditor(null)} />}
    </div>
  );
}

function ScheduleEditor({ initial, id, state, onClose }: { initial: ScheduleInput; id?: string; state: State; onClose: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [chats, setChats] = useState<Chat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { void api.listChats(draft.projectId).then(setChats).catch((reason) => setError(String(reason))); }, [draft.projectId]);
  const change = (patch: Partial<ScheduleInput>) => setDraft((current) => ({ ...current, ...patch }));
  const settings = (patch: Partial<ScheduleInput['settings']>) => change({ settings: { ...draft.settings, ...patch } });
  const save = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(null);
    try { await api.saveSchedule(draft, id); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setSaving(false); }
  };
  const onceLocal = draft.trigger.kind === 'once' && Number.isFinite(draft.trigger.at)
    ? new Date(draft.trigger.at - new Date(draft.trigger.at).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  return <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/65 p-5" onClick={onClose}>
    <form onSubmit={save} onClick={(event) => event.stopPropagation()} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-line bg-panel p-6" aria-label="Agendamento">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{id ? 'Editar agendamento' : 'Novo agendamento'}</h2><button type="button" onClick={onClose} aria-label="Fechar" className="px-2 text-xl text-muted">×</button></div>
      <div className="mt-5 grid grid-cols-2 gap-4">
        <label className="col-span-2 text-xs text-muted">Nome<input required maxLength={100} className={`${fieldClass} mt-1`} value={draft.name} onChange={(event) => change({ name: event.target.value })} placeholder="Ex.: revisar alterações da manhã" /></label>
        <label className="text-xs text-muted">Projeto<select className={`${fieldClass} mt-1`} value={draft.projectId} onChange={(event) => change({ projectId: event.target.value, chatId: null })}>{state.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-xs text-muted">Quando<select className={`${fieldClass} mt-1`} value={draft.trigger.kind} onChange={(event) => change({ trigger: event.target.value === 'interval' ? { kind: 'interval', minutes: 60 } : event.target.value === 'cron' ? { kind: 'cron', expression: '0 9 * * 1-5', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } : { kind: 'once', at: Date.now() + 3600000 } })}><option value="interval">Intervalo fixo</option><option value="cron">Cron com fuso</option><option value="once">Uma vez</option></select></label>
        {draft.trigger.kind === 'interval' && <label className="col-span-2 text-xs text-muted">Intervalo em minutos<input className={`${fieldClass} mt-1`} type="number" min={1} max={525600} required value={draft.trigger.minutes} onChange={(event) => change({ trigger: { kind: 'interval', minutes: Number(event.target.value) } })} /></label>}
        {draft.trigger.kind === 'once' && <label className="col-span-2 text-xs text-muted">Data e hora deste computador ({Intl.DateTimeFormat().resolvedOptions().timeZone})<input className={`${fieldClass} mt-1`} type="datetime-local" required value={onceLocal} onChange={(event) => change({ trigger: { kind: 'once', at: new Date(event.target.value).getTime() } })} /></label>}
        {draft.trigger.kind === 'cron' && <>
          <label className="text-xs text-muted">Cron (5 campos)<input required className={`${fieldClass} mt-1 font-mono`} value={draft.trigger.expression} onChange={(event) => change({ trigger: { ...(draft.trigger as Extract<ScheduleTrigger, { kind: 'cron' }>), expression: event.target.value } })} /><span className="mt-1 block">minuto hora dia mês dia-da-semana</span></label>
          <label className="text-xs text-muted">Fuso IANA<input required className={`${fieldClass} mt-1`} value={draft.trigger.timezone} placeholder="America/Sao_Paulo" onChange={(event) => change({ trigger: { ...(draft.trigger as Extract<ScheduleTrigger, { kind: 'cron' }>), timezone: event.target.value } })} /></label>
        </>}
        <label className="text-xs text-muted">Agente<select className={`${fieldClass} mt-1`} value={draft.settings.agent} onChange={(event) => settings({ agent: event.target.value as AgentMode })}><option value="claude">Claude</option><option value="codex">Codex</option><option value="auto">Automático</option></select></label>
        <label className="text-xs text-muted">Permissões<select className={`${fieldClass} mt-1`} value={draft.settings.permissionLevel} onChange={(event) => settings({ permissionLevel: event.target.value as ScheduleInput['settings']['permissionLevel'] })}><option value="ask">Perguntar</option><option value="acceptEdits">Aceitar edições</option><option value="full">Liberar tudo</option></select></label>
        {(['claude', 'codex'] as AgentId[]).filter((agent) => draft.settings.agent === 'auto' || draft.settings.agent === agent).map((agent) => {
          const modelKey = agent === 'claude' ? 'claudeModel' : 'codexModel';
          const effortKey = agent === 'claude' ? 'claudeEffort' : 'codexEffort';
          const models = state.models[agent] ?? [];
          const selected = models.find((item) => item.id === draft.settings[modelKey]) ?? models.find((item) => item.isDefault);
          return <div key={agent} className="col-span-2 grid grid-cols-2 gap-4">
            <label className="text-xs text-muted">{agent === 'claude' ? 'Claude' : 'Codex'} · modelo<select className={`${fieldClass} mt-1`} value={draft.settings[modelKey] ?? ''} onChange={(event) => settings({ [modelKey]: event.target.value || null, [effortKey]: null })}><option value="">Padrão</option>{models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}{draft.settings[modelKey] && !models.some((item) => item.id === draft.settings[modelKey]) && <option value={draft.settings[modelKey]!}>{draft.settings[modelKey]}</option>}</select></label>
            <label className="text-xs text-muted">Esforço<select className={`${fieldClass} mt-1`} value={draft.settings[effortKey] ?? ''} onChange={(event) => settings({ [effortKey]: event.target.value || null })}><option value="">Padrão</option>{(selected?.efforts ?? []).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          </div>;
        })}
        <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.continueChat} onChange={(event) => change({ continueChat: event.target.checked, chatId: null })} />Continuar um chat existente (desmarcado: abrir um novo em cada execução)</label>
        {draft.continueChat && <label className="col-span-2 text-xs text-muted">Chat<select required className={`${fieldClass} mt-1`} value={draft.chatId ?? ''} onChange={(event) => change({ chatId: event.target.value || null })}><option value="">Escolha um chat</option>{chats.map((chat) => <option key={chat.id} value={chat.id}>{chat.title}</option>)}</select></label>}
        <label className="col-span-2 text-xs text-muted">Mensagem<textarea required maxLength={20000} rows={4} className={`${fieldClass} mt-1 resize-y`} value={draft.prompt} onChange={(event) => change({ prompt: event.target.value })} placeholder="O que a IA deve fazer neste projeto?" /></label>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
      <p className="mt-4 text-xs leading-relaxed text-muted">Tarefas usam a cota do seu plano. Em Perguntar, a execução pode aguardar sua aprovação na bandeja. Salvar uma edição recalcula o próximo disparo; não interrompe um turno em andamento.</p>
      <div className="mt-5 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded bg-raised px-4 py-2">Cancelar</button><button disabled={saving} className="rounded bg-codex px-4 py-2 font-semibold text-ink disabled:opacity-50">{saving ? 'Salvando…' : 'Salvar agendamento'}</button></div>
    </form>
  </div>;
}
