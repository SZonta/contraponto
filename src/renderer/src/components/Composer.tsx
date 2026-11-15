import { useEffect, useRef, useState } from 'react';
import type { AgentId, AgentMode, Chat, ChatSettings, ModelOption, PermissionLevel } from '@shared/types';
import { AGENT_LABELS, api } from '../lib';
import { effortLabel, mentionOptions, mentionTarget, permissionNotice, readableError, type Draft, type DraftUpdate } from '../ux';

const PERMISSIONS: { value: PermissionLevel; label: string }[] = [
  { value: 'ask', label: 'Perguntar' }, { value: 'acceptEdits', label: 'Aceitar edições' }, { value: 'full', label: 'Liberar tudo' },
];

type Props = {
  chat: Chat; models: Partial<Record<AgentId, ModelOption[]>>; running: boolean;
  modelErrors: Partial<Record<AgentId, string>>; retryModels: (agent: AgentId) => Promise<void>;
  draft: Draft; onDraft: (draft: DraftUpdate) => void; onChange: (settings: ChatSettings) => void;
};

function ModelPicker({ agent, chat, models, disabled, onChange }: {
  agent: AgentId; chat: Chat; models?: ModelOption[]; disabled: boolean; onChange: (settings: ChatSettings) => void;
}) {
  const modelKey = agent === 'claude' ? 'claudeModel' : 'codexModel';
  const effortKey = agent === 'claude' ? 'claudeEffort' : 'codexEffort';
  const selected = models?.find((item) => item.id === chat[modelKey]) ?? models?.find((item) => item.isDefault);
  return <fieldset className="min-w-0 rounded border border-line px-3 py-2">
    <legend className={`px-1 text-xs font-semibold ${agent === 'claude' ? 'text-claude' : 'text-codex'}`}>{AGENT_LABELS[agent]}</legend>
    <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-2">
      <label className="min-w-0 text-xs text-muted">Modelo<select disabled={disabled || !models} aria-label={`Modelo do ${AGENT_LABELS[agent]}`} value={chat[modelKey] ?? ''}
        onChange={(event) => onChange({ [modelKey]: event.target.value || null, [effortKey]: null })} className="mt-1 w-full min-w-0 rounded border bg-ink px-2 text-xs text-text">
        <option value="">{models ? 'Modelo padrão' : 'Carregando…'}</option>
        {models?.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        {chat[modelKey] && !models?.some((item) => item.id === chat[modelKey]) && <option value={chat[modelKey]!}>{chat[modelKey]}</option>}
      </select></label>
      <label className="text-xs text-muted">Esforço<select disabled={disabled || !models} aria-label={`Esforço do ${AGENT_LABELS[agent]}`} value={chat[effortKey] ?? ''}
        onChange={(event) => onChange({ [effortKey]: event.target.value || null })} className="mt-1 w-full rounded border bg-ink px-2 text-xs text-text">
        <option value="">Padrão</option>{(selected?.efforts ?? []).map((effort) => <option key={effort} value={effort}>{effortLabel(effort)}</option>)}
      </select></label>
    </div>
  </fieldset>;
}

export function Composer({ chat, models, running, onChange, draft, onDraft, modelErrors, retryModels }: Props) {
  const options = useRef<HTMLDetailsElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [dismissMention, setDismissMention] = useState(false);
  const [optionIndex, setOptionIndex] = useState(0);
  const agent: AgentId = chat.agent === 'codex' ? 'codex' : 'claude';
  const pickerAgents: AgentId[] = chat.agent === 'auto' ? ['claude', 'codex'] : [agent];
  const target = mentionTarget(draft.text);
  const suggestions = !dismissMention ? mentionOptions(draft.text, cursor) : null;
  const blocked = running || sending;
  useEffect(() => {
    const closeOutside = (event: Event) => {
      if (options.current?.open && !options.current.contains(event.target as Node)) options.current.open = false;
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('focusin', closeOutside); };
  }, []);
  const chooseMention = (name: string) => {
    if (!suggestions) return;
    const text = `${draft.text.slice(0, suggestions.start)}@${name} ${draft.text.slice(cursor)}`;
    onDraft({ ...draft, text }); setDismissMention(true);
    requestAnimationFrame(() => { const input = document.getElementById('message-input') as HTMLTextAreaElement; input.focus(); input.setSelectionRange(suggestions.start + name.length + 2, suggestions.start + name.length + 2); });
  };
  const send = async () => {
    if (!draft.text.trim() || blocked || attaching) return;
    setSending(true); setError(null);
    try { await api.sendMessage(chat.id, draft.text, draft.attachments); onDraft((current) => ({ text: current.text === draft.text ? '' : current.text, attachments: current.attachments.filter((file) => !draft.attachments.includes(file)) })); }
    catch (reason) { setError(readableError(reason)); }
    finally { setSending(false); }
  };
  const addFiles = async (files: File[]) => {
    setAttaching(true); setError(null);
    try {
      const added = await Promise.all(files.map(async (file) => {
        try { return await api.attachFile(file); }
        catch { return api.saveAttachment(file.name || 'image.png', file.type || 'application/octet-stream', new Uint8Array(await file.arrayBuffer())); }
      }));
      onDraft((current) => ({ ...current, attachments: [...current.attachments, ...added] }));
    } catch (reason) { setError(`Não foi possível anexar. ${readableError(reason)}`); }
    finally { setAttaching(false); }
  };
  return <section aria-label="Escrever mensagem" className="composer-shell shrink-0 border-t border-line bg-ink px-5 py-3"
    onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void addFiles([...event.dataTransfer.files]); }}>
    <div className="mx-auto max-w-3xl">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-muted">Responder com
          <select aria-label="Agente" value={chat.agent} disabled={blocked} onChange={(event) => onChange({ agent: event.target.value as AgentMode })}
            className="rounded border bg-panel px-2 text-sm font-semibold text-text">
            <option value="claude">Claude</option><option value="codex">Codex</option><option value="auto">Automático</option>
          </select>
        </label>
        <span className="min-w-0 text-right text-xs text-muted">{target ? `Menção: ${AGENT_LABELS[target]} responde` : chat.agent === 'auto' ? 'Claude lidera · Codex colabora' : permissionNotice(chat.permissionLevel)}</span>
      </div>
      {draft.attachments.length > 0 && <ul aria-label="Anexos da mensagem" className="mb-2 flex flex-wrap gap-2">
        {draft.attachments.map((file, index) => <li key={`${file.path}-${index}`} className="flex min-w-0 items-center gap-1 rounded border border-line bg-panel pl-2 text-xs">
          <span className="max-w-48 truncate">📎 {file.name}</span><button aria-label={`Remover anexo ${file.name}`} onClick={() => onDraft({ ...draft, attachments: draft.attachments.filter((_, position) => position !== index) })} className="icon-button">×</button>
        </li>)}
      </ul>}
      <div className="relative">
        <label htmlFor="message-input" className="sr-only">Mensagem</label>
        <textarea id="message-input" value={draft.text} rows={2} placeholder="Descreva a próxima ação…" aria-describedby="message-help"
          aria-autocomplete="list" aria-controls={suggestions ? 'mention-options' : undefined} aria-activedescendant={suggestions ? `mention-option-${optionIndex}` : undefined}
          onChange={(event) => { onDraft({ ...draft, text: event.target.value }); setCursor(event.target.selectionStart); setDismissMention(false); setOptionIndex(0); }}
          onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
          onPaste={(event) => { if (event.clipboardData.files.length) { event.preventDefault(); void addFiles([...event.clipboardData.files]); } }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (suggestions) {
              if (event.key === 'Escape') { event.preventDefault(); setDismissMention(true); return; }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOptionIndex((current) => (current + (event.key === 'ArrowDown' ? 1 : suggestions.options.length - 1)) % suggestions.options.length); return; }
              if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) { event.preventDefault(); chooseMention(suggestions.options[optionIndex] ?? suggestions.options[0]); return; }
            }
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); }
          }} className="block min-h-16 w-full resize-none rounded-lg border bg-panel px-3 py-2.5 text-sm leading-relaxed" />
        {suggestions && <div id="mention-options" role="listbox" className="absolute bottom-full left-0 z-10 mb-2 w-64 rounded-lg border border-control bg-panel p-2 shadow-xl" aria-label="Completar menção">
          <p className="px-2 py-1 text-xs text-muted">Quem deve responder? ↑ ↓ e Enter</p>
          {suggestions.options.map((name, index) => <button key={name} id={`mention-option-${index}`} role="option" aria-selected={index === optionIndex} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseMention(name)} className={`block w-full rounded px-2 py-1 text-left text-sm ${index === optionIndex ? 'bg-raised' : ''}`}>@{name}</button>)}
        </div>}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
      <div className="mt-2 flex items-center gap-3">
        <button disabled={attaching} onClick={async () => {
          setError(null); setAttaching(true);
          try { const files = await api.pickAttachments(); onDraft((current) => ({ ...current, attachments: [...current.attachments, ...files] })); }
          catch (reason) { setError(readableError(reason)); } finally { setAttaching(false); }
        }} className="secondary-button text-xs">{attaching ? 'Anexando…' : '📎 Anexar'}</button>
        <p id="message-help" className="min-w-0 flex-1 text-xs text-muted">Enter envia · Shift+Enter quebra linha · @ escolhe a IA</p>
        {running ? <button onClick={() => void api.interrupt(chat.id).catch((reason) => setError(readableError(reason)))} className="rounded border border-red-400 px-4 py-2 text-sm font-semibold text-red-200">Parar</button>
          : <button onClick={() => void send()} disabled={!draft.text.trim() || sending || attaching} className="primary-button disabled:opacity-40" aria-label={`Enviar mensagem${target ? ` para ${AGENT_LABELS[target]}` : ''}`}>{sending ? 'Enviando…' : 'Enviar'}</button>}
      </div>
      <details ref={options} className="composer-options mt-1" onKeyDown={(event) => {
        if (event.key === 'Escape' && options.current?.open) {
          event.preventDefault(); event.stopPropagation(); options.current.open = false; options.current.querySelector('summary')?.focus();
        }
      }}>
        <summary>Opções do turno <span className={`ml-auto truncate ${chat.permissionLevel === 'full' ? 'font-semibold text-amber-200' : ''}`}>{chat.permissionLevel === 'full' ? permissionNotice('full') : chat.permissionLevel === 'acceptEdits' ? 'Aceitar edições' : 'Perguntar antes de agir'}</span></summary>
        <div className="composer-options-content" role="group" aria-label="Modelos, esforço e permissões">
          <div className={`grid gap-2 ${pickerAgents.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {pickerAgents.map((id) => <ModelPicker key={id} agent={id} chat={chat} models={models[id]} disabled={blocked} onChange={onChange} />)}
          </div>
          {pickerAgents.map((id) => modelErrors[id] && <p role="alert" key={id} className="mt-2 text-xs text-amber-200">{AGENT_LABELS[id]}: {modelErrors[id]} <button onClick={() => void retryModels(id)} className="underline">Tentar novamente</button></p>)}
          <label className="mt-3 flex items-center gap-3 text-xs text-muted">Permissões
            <select aria-label="Permissão" value={chat.permissionLevel} disabled={blocked} onChange={(event) => onChange({ permissionLevel: event.target.value as PermissionLevel })} className="rounded border bg-ink px-2 text-xs text-text">
              {PERMISSIONS.map((permission) => <option key={permission.value} value={permission.value}>{permission.label}</option>)}
            </select>
          </label>
          {blocked && <p className="mt-2 text-xs text-muted">Espere o turno terminar para mudar as opções.</p>}
        </div>
      </details>
    </div>
  </section>;
}
