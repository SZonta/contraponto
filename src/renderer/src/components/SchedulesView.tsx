import { useEffect, useState } from 'react';
import type { AgentId, AgentMode, Chat, Schedule, ScheduleInput, ScheduleTrigger } from '@shared/types';
import type { useAppState } from '../useAppState';
import { api, MODE_LABELS } from '../lib';
import { effortLabel, readableError, scheduleDraftError } from '../ux';
import { Dialog } from './Dialog';
import { ConfirmDelete } from './ConfirmDelete';

type State = ReturnType<typeof useAppState>;
const fieldClass = 'w-full min-w-0 rounded border bg-ink px-3 py-2 text-sm text-text';
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
  const [deleting, setDeleting] = useState<Schedule | null>(null);
  const folders = state.projects.filter((project) => !project.scratch);
  const current = state.chats.find((chat) => chat.id === state.chatId)?.projectId;
  const startEditor = () => { setEditingId(undefined); setEditor(fresh((folders.find((project) => project.id === current) ?? folders[0]).id)); };
  const act = async (action: () => Promise<unknown>) => {
    try { setError(null); await action(); } catch (reason) { setError(readableError(reason)); }
  };
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0"><h1 className="text-lg font-semibold">Programe a próxima ação</h1>
            <p className="mt-2 max-w-xl text-sm text-muted">O app precisa estar aberto, inclusive na bandeja.</p></div>
          {!!state.schedules.length && <button disabled={!folders.length} onClick={startEditor}
            className="primary-button shrink-0 disabled:opacity-40">+ Novo agendamento</button>}
        </div>
        <details className="mt-4 rounded border border-line bg-panel px-4 py-2 text-xs leading-relaxed text-muted"><summary>Como funcionam os horários e as aprovações?</summary><p className="pt-2">
          Ao voltar da suspensão, cada tarefa atrasada roda uma vez. A fila respeita o trabalho em andamento na pasta.
          Pedidos de aprovação continuam valendo; pausar não interrompe um turno que já começou.
        </p></details>
        {error && <p role="alert" className="mt-4 text-red-400">{error}</p>}
        {!state.schedules.length && <div className="mt-8 rounded-lg border border-dashed border-control p-6 text-center"><h2 className="font-semibold">Nenhuma tarefa agendada</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">Escolha um pedido curto e um horário. O resultado aparece em uma conversa.</p><button disabled={!folders.length} onClick={startEditor} className="primary-button mt-5 disabled:opacity-40">+ Novo agendamento</button>{!folders.length && <p className="mt-3 text-xs text-muted">Escolha uma pasta em um chat antes de criar uma tarefa.</p>}</div>}
        <div className="mt-6 grid gap-3">
          {state.schedules.map((item) => <article key={item.id} className="rounded-lg border border-line bg-panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0"><h2 className="truncate font-semibold">{item.name} <span className={`ml-2 text-xs font-normal ${item.enabled ? 'text-codex' : 'text-muted'}`}>{item.enabled ? 'Ativo' : 'Pausado'}</span></h2>
                <p className="mt-1 text-xs text-muted">{state.projects.find((project) => project.id === item.projectId)?.name} · {MODE_LABELS[item.settings.agent]} · {triggerLabel(item.trigger)}</p>
                <p className="mt-3 line-clamp-2 whitespace-pre-wrap text-sm text-muted">{item.prompt}</p></div>
              <div className="flex shrink-0 gap-3 text-xs">
                <button aria-label={`Editar ${item.name}`} onClick={() => { setEditingId(item.id); setEditor(item); }} className="hover:text-codex">Editar</button>
                <button aria-label={`${item.enabled ? 'Pausar' : 'Ativar'} ${item.name}`} onClick={() => void act(() => api.pauseSchedule(item.id, item.enabled))} className="hover:text-codex">{item.enabled ? 'Pausar' : 'Ativar'}</button>
                <button aria-label={`Apagar ${item.name}`} onClick={() => setDeleting(item)} className="text-muted hover:text-red-300">Apagar</button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3 text-xs text-muted">
              <span>Próxima: {item.enabled ? dateLabel(item.nextRunAt) : 'pausado'}</span>
              <span>Última: {item.lastRunAt ? `${dateLabel(item.lastRunAt)} · ${statuses[item.lastStatus]}` : 'ainda não executou'}</span>
              {item.lastChatId && <button onClick={() => state.openChat(item.lastChatId!)} className="ml-auto text-codex">Ver resultado →</button>}
            </div>
            {item.lastError && <p className="mt-2 text-xs text-red-400">{item.lastError}</p>}
          </article>)}
        </div>
      </div>
      {editor && <ScheduleEditor key={editingId ?? 'new'} initial={editor} id={editingId} state={state} onClose={() => setEditor(null)} />}
      {deleting && <ConfirmDelete title="Apagar este agendamento?" name={deleting.name} description="O agendamento será removido. As conversas e os resultados serão preservados. Uma execução já iniciada continua até terminar."
        button="Apagar agendamento" onClose={() => setDeleting(null)} onConfirm={() => api.deleteSchedule(deleting.id)} />}
    </div>
  );
}

function ScheduleEditor({ initial, id, state, onClose }: { initial: ScheduleInput; id?: string; state: State; onClose: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [chats, setChats] = useState<Chat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);
  useEffect(() => { let active = true; setLoadingChats(true); void api.listChats(draft.projectId).then((list) => { if (active) setChats(list); }).catch((reason) => { if (active) setError(readableError(reason)); }).finally(() => { if (active) setLoadingChats(false); }); return () => { active = false; }; }, [draft.projectId]);
  const change = (patch: Partial<ScheduleInput>) => setDraft((current) => ({ ...current, ...patch }));
  const settings = (patch: Partial<ScheduleInput['settings']>) => change({ settings: { ...draft.settings, ...patch } });
  const save = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const invalid = scheduleDraftError(draft);
    if (invalid) { setError(invalid); return; }
    setSaving(true); setError(null);
    try { await api.saveSchedule(draft, id); onClose(); } catch { setError('Não foi possível salvar. Confira os campos, o cron e o fuso e tente novamente.'); } finally { setSaving(false); }
  };
  const onceLocal = draft.trigger.kind === 'once' && Number.isFinite(draft.trigger.at)
    ? new Date(draft.trigger.at - new Date(draft.trigger.at).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  return <Dialog title={id ? 'Editar agendamento' : 'Novo agendamento'} onClose={onClose} wide footer={<>{error && <p role="alert" className="w-full text-sm text-red-200">{error}</p>}<button type="button" onClick={onClose} className="secondary-button">Cancelar</button><button form="schedule-editor-form" type="submit" disabled={saving} className="primary-button disabled:opacity-50">{saving ? 'Salvando…' : 'Salvar agendamento'}</button></>}>
    <form id="schedule-editor-form" onSubmit={save} aria-label="Agendamento">
      <div className="grid grid-cols-2 gap-4">
        <label className="col-span-2 text-xs text-muted">Nome<input required maxLength={100} className={`${fieldClass} mt-1`} value={draft.name} onChange={(event) => change({ name: event.target.value })} placeholder="Ex.: revisar alterações da manhã" /></label>
        <label className="text-xs text-muted">Pasta<select className={`${fieldClass} mt-1`} value={draft.projectId} onChange={(event) => change({ projectId: event.target.value, chatId: null })}>{state.projects.filter((item) => !item.scratch).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
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
            <label className="text-xs text-muted">Esforço<select className={`${fieldClass} mt-1`} value={draft.settings[effortKey] ?? ''} onChange={(event) => settings({ [effortKey]: event.target.value || null })}><option value="">Padrão</option>{(selected?.efforts ?? []).map((value) => <option key={value} value={value}>{effortLabel(value)}</option>)}</select></label>
          </div>;
        })}
        <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.continueChat} onChange={(event) => change({ continueChat: event.target.checked, chatId: null })} />Continuar um chat existente (desmarcado: abrir um novo em cada execução)</label>
        {draft.continueChat && <label className="col-span-2 text-xs text-muted">Chat<select required disabled={loadingChats} className={`${fieldClass} mt-1`} value={draft.chatId ?? ''} onChange={(event) => change({ chatId: event.target.value || null })}><option value="">{loadingChats ? 'Carregando conversas…' : 'Escolha um chat'}</option>{chats.map((chat) => <option key={chat.id} value={chat.id}>{chat.title}</option>)}</select></label>}
        <label className="col-span-2 text-xs text-muted">Mensagem<textarea required maxLength={20000} rows={4} className={`${fieldClass} mt-1 resize-y`} value={draft.prompt} onChange={(event) => change({ prompt: event.target.value })} placeholder="O que a IA deve fazer neste projeto?" /></label>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted">Tarefas usam a cota do seu plano. Em Perguntar, a execução pode aguardar sua aprovação na bandeja. Salvar uma edição recalcula o próximo disparo; não interrompe um turno em andamento.</p>
    </form>
  </Dialog>;
}
