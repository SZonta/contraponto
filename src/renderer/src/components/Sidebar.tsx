import { useState } from 'react';
import type { Chat } from '@shared/types';
import type { useAppState } from '../useAppState';
import { MODE_COLORS, MODE_LABELS } from '../lib';
import { SettingsModal } from './SettingsModal';
import iconUrl from '../../../../build/icon.svg?url';
import { ConfirmDelete } from './ConfirmDelete';

type Props = { state: ReturnType<typeof useAppState> };

export function Sidebar({ state }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleting, setDeleting] = useState<Chat | null>(null);

  const saveTitle = (chatId: string) => {
    const title = draft.trim();
    if (title) void state.updateChat(chatId, { title });
    setEditing(null);
  };

  return (
    <aside aria-label="Projetos e conversas" className="app-sidebar flex min-h-0 shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3"><img src={iconUrl} alt="" width={24} height={24} /><span className="font-semibold">Contraponto</span></div>
      <div className="px-4 pt-4 pb-2 text-xs font-semibold tracking-wider text-muted uppercase">Projetos</div>
      <div className="flex max-h-[24vh] shrink-0 flex-col gap-0.5 overflow-y-auto px-2">
        {state.projects.map((project) => (
          <button
            key={project.id}
            title={project.path}
            aria-pressed={project.id === state.projectId}
            onClick={() => { state.setProjectId(project.id); state.setSchedulesOpen(false); }}
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
            + Novo chat
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3">
        {state.chats.map((chat) => (
          <div
            key={chat.id}
            className={`chat-row group flex items-center gap-1 rounded px-2 py-2 ${chat.id === state.chatId && !state.schedulesOpen ? 'bg-raised' : 'hover:bg-raised/60'}`}
          >
            {editing === chat.id ? (
              <input
                autoFocus
                aria-label="Nome do chat"
                onFocus={(event) => event.currentTarget.select()}
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
              <button onClick={() => { state.setChatId(chat.id); state.setSchedulesOpen(false); }} aria-current={chat.id === state.chatId && !state.schedulesOpen ? 'page' : undefined} className="chat-label min-w-0 flex-1 text-left" title={chat.title}>
                <span className="block truncate">{chat.title}</span>
                <span className={`text-xs ${MODE_COLORS[chat.agent]}`}>
                  {MODE_LABELS[chat.agent]}
                  {state.running.has(chat.id) ? ' · respondendo…' : state.background[chat.id] ? ' · em segundo plano…' : ''}
                </span>
                {state.allApprovals.some((request) => request.chatId === chat.id) && <span className="block text-xs font-semibold text-amber-200">Precisa de você</span>}
              </button>
            )}
            <div className="chat-actions shrink-0 gap-0.5">
              <button
                title="Renomear"
                aria-label={`Renomear chat ${chat.title}`}
                onClick={() => {
                  setDraft(chat.title);
                  setEditing(chat.id);
                }}
                className="icon-button"
              >
                ✎
              </button>
              <button
                title="Apagar"
                aria-label={`Apagar chat ${chat.title}`}
                disabled={state.running.has(chat.id)}
                onClick={() => setDeleting(chat)}
                className="icon-button disabled:opacity-40 hover:text-red-300"
              >
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => state.setSchedulesOpen(true)}
        aria-current={state.schedulesOpen ? 'page' : undefined}
        className={`border-t border-line px-4 py-3 text-left text-sm hover:bg-raised/60 ${state.schedulesOpen ? 'text-codex bg-raised/50' : 'text-text'}`}>
        ◷ Agendamentos <span className="ml-2 text-xs text-muted">{state.schedules.filter((item) => item.enabled).length} ativos</span>
      </button>
      <button
        onClick={() => setSettingsOpen(true)}
        className="border-t border-line px-4 py-2.5 text-left text-sm text-muted hover:bg-raised/60 hover:text-text"
      >
        ⚙ Configurações
      </button>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {deleting && <ConfirmDelete title="Apagar esta conversa?" name={deleting.title} description="As mensagens desta conversa serão apagadas. Os arquivos do projeto serão preservados. Esta ação não pode ser desfeita."
        button="Apagar chat" onClose={() => setDeleting(null)} onConfirm={() => state.deleteChat(deleting.id)} />}
    </aside>
  );
}
