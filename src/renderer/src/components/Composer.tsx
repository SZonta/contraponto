import { useState } from 'react';
import type { AgentId, Attachment, Chat, ChatSettings, ModelOption, PermissionLevel } from '@shared/types';
import { AGENT_LABELS, api } from '../lib';

const PERMISSIONS: { value: PermissionLevel; label: string }[] = [
  { value: 'ask', label: 'Perguntar' },
  { value: 'acceptEdits', label: 'Aceitar edições' },
  { value: 'full', label: 'Liberar tudo' },
];

type Props = {
  chat: Chat;
  models: Partial<Record<AgentId, ModelOption[]>>;
  running: boolean;
  onChange: (settings: ChatSettings) => void;
};

function Select({ value, onChange, children, title }: { value: string; onChange: (value: string) => void; children: React.ReactNode; title: string }) {
  return (
    <select
      title={title}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded border border-line bg-panel px-2 py-1 text-xs text-text outline-none"
    >
      {children}
    </select>
  );
}

export function Composer({ chat, models, running, onChange }: Props) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const agent = chat.agent;
  const modelKey = agent === 'claude' ? 'claudeModel' : 'codexModel';
  const effortKey = agent === 'claude' ? 'claudeEffort' : 'codexEffort';
  const modelList = models[agent];
  const model = chat[modelKey];
  const selectedModel = modelList?.find((option) => option.id === model) ?? modelList?.find((option) => option.isDefault);
  const efforts = selectedModel?.efforts ?? [];

  const send = async () => {
    if (!text.trim() || running) return;
    setError(null);
    try {
      await api.sendMessage(chat.id, text, attachments);
      setText('');
      setAttachments([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const addFiles = async (files: File[]) => {
    const added = await Promise.all(
      files.map(async (file) => {
        // Pasted screenshots have no path on disk; dropped files do.
        try {
          return await api.attachFile(file);
        } catch {
          return api.saveAttachment(file.name || 'imagem.png', file.type || 'image/png', new Uint8Array(await file.arrayBuffer()));
        }
      }),
    );
    setAttachments((current) => [...current, ...added]);
  };

  return (
    <div
      className="border-t border-line px-5 py-3"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        void addFiles([...event.dataTransfer.files]);
      }}
    >
      <div className="mx-auto max-w-3xl">
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((file) => (
              <span key={file.path} className="flex items-center gap-1 rounded bg-raised px-2 py-0.5 text-xs">
                📎 {file.name}
                <button onClick={() => setAttachments((current) => current.filter((item) => item !== file))} className="text-muted hover:text-text">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onPaste={(event) => {
            const files = [...event.clipboardData.files];
            if (files.length) {
              event.preventDefault();
              void addFiles(files);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          rows={3}
          placeholder={`Mensagem para o ${AGENT_LABELS[agent]} (Enter envia, Shift+Enter quebra linha)`}
          className="w-full resize-none rounded-lg border border-line bg-panel px-3 py-2 outline-none focus:border-muted"
        />
        {error && <div className="mt-1 text-xs text-red-400">{error}</div>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            title="Anexar arquivos"
            onClick={async () => setAttachments([...attachments, ...(await api.pickAttachments())])}
            className="rounded border border-line px-2 py-1 text-xs text-muted hover:text-text"
          >
            📎 Anexar
          </button>
          <Select title="Agente" value={agent} onChange={(value) => onChange({ agent: value as AgentId })}>
            <option value="claude">Claude</option>
            <option value="codex">Codex</option>
          </Select>
          <Select title="Modelo" value={model ?? ''} onChange={(value) => onChange({ [modelKey]: value || null, [effortKey]: null })}>
            <option value="">Modelo padrão</option>
            {modelList?.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select title="Esforço" value={chat[effortKey] ?? ''} onChange={(value) => onChange({ [effortKey]: value || null })}>
            <option value="">Esforço padrão</option>
            {efforts.map((effort) => (
              <option key={effort} value={effort}>
                {effort}
              </option>
            ))}
          </Select>
          <Select title="Permissão" value={chat.permissionLevel} onChange={(value) => onChange({ permissionLevel: value as PermissionLevel })}>
            {PERMISSIONS.map((permission) => (
              <option key={permission.value} value={permission.value}>
                {permission.label}
              </option>
            ))}
          </Select>
          <div className="flex-1" />
          {running ? (
            <button onClick={() => api.interrupt(chat.id)} className="rounded bg-red-800 px-4 py-1.5 text-sm hover:bg-red-700">
              Parar
            </button>
          ) : (
            <button
              onClick={send}
              disabled={!text.trim()}
              className="rounded bg-claude px-4 py-1.5 text-sm font-semibold text-ink disabled:opacity-40"
            >
              Enviar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
