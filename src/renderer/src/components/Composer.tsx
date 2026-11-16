import { useEffect, useRef, useState } from 'react';
import type { AgentId, Attachment, Chat, ChatSettings, ModelOption, PermissionLevel, Project } from '@shared/types';
import { AGENT_LABELS, MODE_LABELS, api, localImageUrl } from '../lib';
import { ImageViewer, type ViewedImage } from './ImageViewer';
import { effortLabel, mentionOptions, mentionTarget, permissionNotice, readableError, type Draft, type DraftUpdate } from '../ux';

const PERMISSIONS: { value: PermissionLevel; label: string }[] = [
  { value: 'ask', label: 'Perguntar' }, { value: 'acceptEdits', label: 'Aceitar edições' }, { value: 'full', label: 'Liberar tudo' },
];

type Props = {
  chat: Chat; project: Project | null; canChooseFolder: boolean; onChooseFolder: () => Promise<void>; models: Partial<Record<AgentId, ModelOption[]>>; running: boolean;
  modelErrors: Partial<Record<AgentId, string>>; retryModels: (agent: AgentId) => Promise<void>;
  draft: Draft; onDraft: (draft: DraftUpdate) => void; onChange: (settings: ChatSettings) => void;
};

function ComposerIcon({ name }: { name: 'attach' | 'folder' | 'send' | 'stop' | 'shield' | 'chevron' | 'settings' | 'close' | 'wave' }) {
  const shapes = {
    attach: <path d="m9 12 5-5a3 3 0 0 1 4 4l-7 7a5 5 0 0 1-7-7l8-8a3.8 3.8 0 0 1 5.4 5.4L9 16a1.8 1.8 0 0 1-2.5-2.5l7-7" />,
    folder: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M12 11v5m-2.5-2.5h5" /></>,
    send: <path d="M12 19V5m-5.5 5.5L12 5l5.5 5.5" />,
    stop: <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" />,
    shield: <><path d="m12 3 7 3v6c0 4-7 9-7 9s-7-5-7-9V6Z" /><path d="m9 12 2 2 4-4" /></>,
    chevron: <path d="m8 10 4 4 4-4" />,
    settings: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" fill="var(--color-ink)" /><circle cx="16" cy="12" r="2" fill="var(--color-ink)" /><circle cx="10" cy="18" r="2" fill="var(--color-ink)" /></>,
    close: <path d="m8 8 8 8m0-8-8 8" />,
    wave: <path d="M2 12c3-10 6-10 10 0s7 10 10 0" />,
  };
  return <svg className="composer-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{shapes[name]}</svg>;
}

function AttachmentPreview({ file, onOpen, onRemove }: { file: Attachment; onOpen: (image: ViewedImage) => void; onRemove: () => void }) {
  const [failed, setFailed] = useState(false);
  const isImage = file.mimeType.startsWith('image/');
  return <li className="composer-attachment">
    {isImage ? <button type="button" className="composer-thumbnail" disabled={failed} aria-label={failed ? 'Imagem indisponível' : `Ampliar imagem: ${file.name}`} title={failed ? 'Imagem indisponível' : 'Ampliar imagem'}
      onClick={() => onOpen({ src: localImageUrl(file.path), alt: file.name })}>
      {failed ? <ComposerIcon name="attach" /> : <img src={localImageUrl(file.path)} alt="" onError={() => setFailed(true)} />}
    </button> : <span className="composer-file-icon"><ComposerIcon name="attach" /></span>}
    <span className="composer-file-info"><strong title={file.name}>{file.name}</strong><span>{isImage ? failed ? 'Imagem indisponível' : `Imagem · ${file.mimeType.slice(6).toUpperCase()}` : 'Arquivo'}</span></span>
    <button type="button" aria-label={`Remover anexo ${file.name}`} title="Remover anexo" onClick={onRemove} className="composer-tool composer-remove"><ComposerIcon name="close" /></button>
  </li>;
}

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

export function Composer({ chat, project, canChooseFolder, onChooseFolder, models, running, onChange, draft, onDraft, modelErrors, retryModels }: Props) {
  // A plain toggle instead of <details>: Chromium crashed when a native select popup closed inside a collapsing <details>.
  const options = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [viewedImage, setViewedImage] = useState<ViewedImage | null>(null);
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
  const folderName = project && !project.scratch ? project.name : 'Sem pasta';
  useEffect(() => {
    const closeOutside = (event: Event) => {
      if (options.current && !options.current.contains(event.target as Node)) setOptionsOpen(false);
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

  return <section aria-label="Escrever mensagem" className="composer-shell shrink-0 border-t border-transparent bg-ink px-5 py-3"
    onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void addFiles([...event.dataTransfer.files]); }}>
    <div className="mx-auto max-w-3xl">
      <div className="composer-agent-row">
        <div className="composer-agents" role="group" aria-label="Agente">
          {(['claude', 'codex', 'auto'] as const).map((mode) => <button key={mode} type="button" disabled={blocked} aria-pressed={chat.agent === mode}
            aria-label={MODE_LABELS[mode]} title={mode === 'auto' ? 'Automático: Claude lidera · Codex colabora' : MODE_LABELS[mode]}
            onClick={() => onChange({ agent: mode })}>{mode === 'auto' && <ComposerIcon name="wave" />}{mode === 'auto' ? 'Auto' : MODE_LABELS[mode]}</button>)}
        </div>
        {target && <span className="min-w-0 truncate text-xs text-muted">Menção: {AGENT_LABELS[target]} responde</span>}
      </div>
      <div className="composer-surface">
        {draft.attachments.length > 0 && <ul aria-label="Anexos da mensagem" className="composer-attachments">
          {draft.attachments.map((file, index) => <AttachmentPreview key={`${file.path}-${index}`} file={file} onOpen={setViewedImage}
            onRemove={() => onDraft({ ...draft, attachments: draft.attachments.filter((_, position) => position !== index) })} />)}
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
            }} className="composer-input block w-full resize-none border bg-panel text-sm leading-relaxed" />
          {suggestions && <div id="mention-options" role="listbox" className="absolute bottom-full left-0 z-10 mb-2 w-64 rounded-lg border border-control bg-panel p-2 shadow-xl" aria-label="Completar menção">
            <p className="px-2 py-1 text-xs text-muted">Quem deve responder? ↑ ↓ e Enter</p>
            {suggestions.options.map((name, index) => <button key={name} id={`mention-option-${index}`} role="option" aria-selected={index === optionIndex} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseMention(name)} className={`block w-full rounded px-2 py-1 text-left text-sm ${index === optionIndex ? 'bg-raised' : ''}`}>@{name}</button>)}
          </div>}
        </div>
        <div className="composer-toolbar">
          <button type="button" disabled={attaching} aria-label={attaching ? 'Anexando arquivos' : 'Anexar arquivos'} aria-busy={attaching} title="Anexar arquivos" className="composer-tool"
            onClick={async () => {
              setError(null); setAttaching(true);
              try { const files = await api.pickAttachments(); onDraft((current) => ({ ...current, attachments: [...current.attachments, ...files] })); }
              catch (reason) { setError(readableError(reason)); } finally { setAttaching(false); }
            }}><ComposerIcon name="attach" /></button>
          <button type="button" disabled={blocked || attaching || !canChooseFolder} aria-label={`Pasta: ${folderName}`}
            title={canChooseFolder ? `Escolher pasta · Atual: ${project && !project.scratch ? project.path : 'nenhuma'}` : `Pasta: ${project?.path ?? 'nenhuma'} · Só dá para trocar antes da primeira mensagem`}
            className="composer-folder" onClick={() => void onChooseFolder()}><ComposerIcon name="folder" /><span>{folderName}</span></button>
          <p id="message-help" className="composer-help" title="Enter envia · Shift+Enter quebra linha · @ escolhe a IA">
            <span aria-hidden="true">{draft.text ? 'Enter para enviar' : ''}</span><span className="sr-only">Enter envia · Shift+Enter quebra linha · @ escolhe a IA</span>
          </p>
          {running ? <button type="button" onClick={() => void api.interrupt(chat.id).catch((reason) => setError(readableError(reason)))}
            className="composer-action composer-stop" aria-label="Parar resposta" title="Parar resposta"><ComposerIcon name="stop" /></button>
            : <button type="button" onClick={() => void send()} disabled={!draft.text.trim() || sending || attaching} className="composer-action"
              aria-busy={sending} aria-label={sending ? 'Enviando mensagem' : `Enviar mensagem${target ? ` para ${AGENT_LABELS[target]}` : ''}`} title="Enviar mensagem"><ComposerIcon name="send" /></button>}
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
      <div ref={options} className="composer-options" onKeyDown={(event) => {
        if (event.key === 'Escape' && optionsOpen) {
          event.preventDefault(); event.stopPropagation(); setOptionsOpen(false); toggle.current?.focus();
        }
      }}>
        <div className="composer-controls">
          <label className={`composer-permission ${chat.permissionLevel === 'full' ? 'text-amber-200' : ''}`} title={permissionNotice(chat.permissionLevel)}>
            <ComposerIcon name="shield" /><select aria-label="Permissão" value={chat.permissionLevel} disabled={blocked}
              onChange={(event) => onChange({ permissionLevel: event.target.value as PermissionLevel })}>
              {PERMISSIONS.map((permission) => <option key={permission.value} value={permission.value}>{permission.label}</option>)}
            </select><ComposerIcon name="chevron" />
          </label>
          <button ref={toggle} type="button" className="composer-options-toggle" aria-expanded={optionsOpen} aria-controls="turn-options"
            onClick={() => setOptionsOpen((open) => !open)}><ComposerIcon name="settings" />Modelo e esforço</button>
        </div>
        {optionsOpen && <div id="turn-options" className="composer-options-content" role="group" aria-label="Modelos e esforço">
          <div className="composer-model-grid">
            {pickerAgents.map((id) => <ModelPicker key={id} agent={id} chat={chat} models={models[id]} disabled={blocked} onChange={onChange} />)}
          </div>
          {pickerAgents.map((id) => modelErrors[id] && <p role="alert" key={id} className="mt-2 text-xs text-amber-200">{AGENT_LABELS[id]}: {modelErrors[id]} <button onClick={() => void retryModels(id)} className="underline">Tentar novamente</button></p>)}
          {blocked && <p className="mt-2 text-xs text-muted">Espere o turno terminar para mudar as opções.</p>}
        </div>}
      </div>
    </div>
    {viewedImage && <ImageViewer image={viewedImage} onClose={() => setViewedImage(null)} />}
  </section>;
}