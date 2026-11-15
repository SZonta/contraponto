import { useState } from 'react';
import type { useAppState } from '../useAppState';
import { MODE_COLORS, MODE_LABELS } from '../lib';
import { SettingsModal } from './SettingsModal';

type Props = { state: ReturnType<typeof useAppState> };

export function Sidebar({ state }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const saveTitle = (chatId: string) => {
    const title = draft.trim();
    if (title) void state.updateChat(chatId, { title });
    setEditing(null);
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-panel">
      <div className="px-4 pt-4 pb-2 text-xs font-semibold tracking-wider text-muted uppercase">Projetos</div>
      <div className="flex flex-col gap-0.5 px-2">
        {state.projects.map((project) => (
          <button
            key={project.id}
            title={project.path}
            onClick={() => state.setProjectId(project.id)}
            className={`truncate rounded px-2 py-1.5 text-left ${project.id === state.projectId ? 'bg-raised' : 'hover:bg-raised/60'}`}
          >
            {project.name}
          </button>
        ))}
        <button onClick={state.addProject} className="rounded px-2 py-1.5 text-left text-muted hover:bg-raised/60 hover:text-text">
          + Adicionar pasta
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between px-4 pb-2">
        <span className="text-xs font-semibold tracking-wider text-muted uppercase">Chats</span>
        {state.projectId && (
          <button onClick={state.createChat} className="rounded px-2 py-0.5 text-xs text-muted hover:bg-raised hover:text-text">
            + Novo
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3">
        {state.chats.map((chat) => (
          <div
            key={chat.id}
            className={`group flex items-center gap-1 rounded px-2 py-1.5 ${chat.id === state.chatId ? 'bg-raised' : 'hover:bg-raised/60'}`}
          >
            {editing === chat.id ? (
              <input
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => saveTitle(chat.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') saveTitle(chat.id);
                  if (event.key === 'Escape') setEditing(null);
                }}
                className="min-w-0 flex-1 rounded border border-line bg-ink px-1 outline-none"
              />
            ) : (
              <button onClick={() => state.setChatId(chat.id)} className="min-w-0 flex-1 text-left" title={chat.title}>
                <span className="block truncate">{chat.title}</span>
                <span className={`text-xs ${MODE_COLORS[chat.agent]}`}>
                  {MODE_LABELS[chat.agent]}
                  {state.running.has(chat.id) ? ' · respondendo…' : ''}
                </span>
              </button>
            )}
            <div className="hidden gap-1 group-hover:flex">
              <button
                title="Renomear"
                onClick={() => {
                  setDraft(chat.title);
                  setEditing(chat.id);
                }}
                className="rounded px-1 text-muted hover:text-text"
              >
                ✎
              </button>
              <button
                title="Apagar"
                onClick={() => {
                  if (confirm(`Apagar o chat "${chat.title}"? Esta ação não pode ser desfeita.`)) void state.deleteChat(chat.id);
                }}
                className="rounded px-1 text-muted hover:text-red-400"
              >
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={() => setSettingsOpen(true)}
        className="border-t border-line px-4 py-2.5 text-left text-sm text-muted hover:bg-raised/60 hover:text-text"
      >
        ⚙ Configurações
      </button>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </aside>
  );
}
