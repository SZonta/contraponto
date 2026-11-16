import { useEffect, useState } from 'react';
import type { Chat } from '@shared/types';
import { CHAT_TITLE_LIMIT } from '@shared/chat-title';
import type { useAppState } from '../useAppState';
import { SettingsModal } from './SettingsModal';
import iconUrl from '../../../../build/icon.svg?url';
import { ConfirmDelete } from './ConfirmDelete';

type Props = { state: ReturnType<typeof useAppState> };

function SidebarIcon({ name }: { name: 'plus' | 'calendar' | 'settings' | 'chat' | 'folder' | 'chevron' | 'edit' | 'delete' }) {
  const shapes = {
    plus: <path d="M12 5v14M5 12h14" />,
    calendar: <><path d="M8 3v4m8-4v4M3 10h18m0 2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6" /><circle cx="17" cy="17" r="5" /><path d="M17 14v3l2 1" /></>,
    settings: <><path d="M10 3h4l.7 2.5 2 .9 2.3-.7 2 3.5-1.8 1.8v2l1.8 1.8-2 3.5-2.3-.7-2 .9L14 21h-4l-.7-2.5-2-.9-2.3.7-2-3.5L4.8 13v-2L3 9.2l2-3.5 2.3.7 2-.9Z" /><circle cx="12" cy="12" r="3" /></>,
    chat: <><path d="M21 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 3V11.5A7.5 7.5 0 0 1 10.5 4h3a7.5 7.5 0 0 1 7.5 7.5Z" /><path d="M8 10h8m-8 4h5" /></>,
    folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    edit: <path d="m15 5 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15Z" />,
    delete: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></>,
  };
  return <svg className="sidebar-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{shapes[name]}</svg>;
}

const DEFAULT_SIDEBAR_WIDTH = 280;
const MIN_SIDEBAR_WIDTH = 220;
const MIN_CHAT_WIDTH = 360;
const SIDEBAR_WIDTH_KEY = 'contraponto.sidebarWidth';

export function Sidebar({ state }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleting, setDeleting] = useState<Chat | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [width, setWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
      return Number.isFinite(saved) && saved >= MIN_SIDEBAR_WIDTH ? saved : DEFAULT_SIDEBAR_WIDTH;
    } catch { return DEFAULT_SIDEBAR_WIDTH; }
  });
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const maxWidth = Math.max(MIN_SIDEBAR_WIDTH, viewportWidth - MIN_CHAT_WIDTH);
  const sidebarWidth = Math.min(width, maxWidth);
  const activeSchedules = state.schedules.filter((item) => item.enabled).length;

  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width)); } catch { /* Resizing also works when storage is unavailable. */ }
  }, [width]);

  const resizeSidebar = (next: number) => setWidth(Math.round(Math.max(MIN_SIDEBAR_WIDTH, Math.min(maxWidth, next))));

  const saveTitle = (chatId: string) => {
    const title = draft.trim();
    if (title) void state.updateChat(chatId, { title });
    setEditing(null);
  };

  // Chats without a folder come first; folders follow in the order of their latest chat.
  const folders = new Map(state.projects.filter((project) => !project.scratch).map((project) => [project.id, project]));
  const loose = state.chats.filter((chat) => !folders.has(chat.projectId));
  const groups = new Map<string, Chat[]>();
  for (const chat of state.chats) {
    if (folders.has(chat.projectId)) groups.set(chat.projectId, [...(groups.get(chat.projectId) ?? []), chat]);
  }
  const toggleGroup = (projectId: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (!next.delete(projectId)) next.add(projectId);
    return next;
  });

  const renderChat = (chat: Chat) => {
    const selected = chat.id === state.chatId && !state.schedulesOpen;
    const status = state.running.has(chat.id) ? 'Respondendo…' : state.background[chat.id] ? 'Em segundo plano…' : '';
    return (
      <div key={chat.id} className={`chat-row group flex items-center gap-1 rounded-md px-2 py-1.5 ${selected ? 'bg-raised' : 'hover:bg-raised/60'}`}>
        {editing === chat.id ? (
          <input
            autoFocus
            aria-label="Nome do chat"
            maxLength={CHAT_TITLE_LIMIT}
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
          <button onClick={() => state.openChat(chat.id)} aria-current={selected ? 'page' : undefined} className="chat-label flex min-w-0 flex-1 items-center gap-2.5 text-left" title={chat.title}>
            <SidebarIcon name="chat" />
            <span className="min-w-0 flex-1">
              <span className="sidebar-chat-title block leading-snug">{chat.title}</span>
              {status && <span className="block text-xs text-muted">{status}</span>}
              {state.allApprovals.some((request) => request.chatId === chat.id) && <span className="block text-xs font-semibold text-amber-200">Precisa de você</span>}
            </span>
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
            <SidebarIcon name="edit" />
          </button>
          <button
            title="Apagar"
            aria-label={`Apagar chat ${chat.title}`}
            disabled={state.running.has(chat.id)}
            onClick={() => setDeleting(chat)}
            className="icon-button disabled:opacity-40 hover:text-red-300"
          >
            <SidebarIcon name="delete" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <aside aria-label="Conversas" className="app-sidebar flex min-h-0 shrink-0 flex-col border-r border-line bg-panel" style={{ width: sidebarWidth }}>
      <div className="sidebar-brand"><img src={iconUrl} alt="" width={29} height={29} /><span>Contraponto</span></div>
      <nav aria-label="Ações principais" className="sidebar-top-actions">
        <button onClick={() => void state.createChat()} className="sidebar-nav-action sidebar-new-chat">
          <SidebarIcon name="plus" /><span>Novo chat</span>
        </button>
        <button onClick={() => state.setSchedulesOpen(true)} aria-current={state.schedulesOpen ? 'page' : undefined} className="sidebar-nav-action sidebar-schedules">
          <SidebarIcon name="calendar" /><span>Agendamentos</span>
          <span className="sidebar-count" aria-label={`${activeSchedules} agendamentos ativos`}>{activeSchedules}</span>
        </button>
      </nav>

      <nav aria-label="Chats" className="sidebar-chat-list flex min-h-0 flex-1 flex-col overflow-y-auto">
        {state.chats.length > 0 && <div className="sidebar-section-label"><span>Conversas</span><span>{state.chats.length}</span></div>}
        {loose.length > 0 && <div className="flex flex-col gap-0.5">{loose.map(renderChat)}</div>}
        {[...groups].map(([projectId, chats]) => {
          const folder = folders.get(projectId)!;
          const open = !collapsed.has(projectId);
          return (
            <section key={projectId} aria-label={`Pasta ${folder.name}`} className="sidebar-group mt-4 flex flex-col gap-0.5">
              <div className="flex items-center gap-1 px-2 pb-1">
                <button onClick={() => toggleGroup(projectId)} aria-expanded={open} title={folder.path}
                  className="flex min-w-0 items-center gap-1 text-sm font-semibold text-muted hover:text-text">
                  <SidebarIcon name="folder" />
                  <span className="truncate">{folder.name}</span>
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className={`shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}><path d="m8 10 4 4 4-4" /></svg>
                </button>
                <button onClick={() => void state.createChat(projectId)} title={`Novo chat em ${folder.name}`} aria-label={`Novo chat em ${folder.name}`}
                  className="sidebar-group-add icon-button ml-auto">+</button>
              </div>
              {open && chats.map(renderChat)}
            </section>
          );
        })}
      </nav>
      <div className="sidebar-settings-area">
        <button onClick={() => setSettingsOpen(true)} className="sidebar-settings-button">
          <SidebarIcon name="settings" /><span>Configurações</span><SidebarIcon name="chevron" />
        </button>
      </div>
      <div className="sidebar-resize-handle" role="separator" aria-label="Largura da lateral de chats" aria-orientation="vertical" aria-controls="conversation"
        aria-valuemin={MIN_SIDEBAR_WIDTH} aria-valuemax={maxWidth} aria-valuenow={sidebarWidth} aria-valuetext={`${sidebarWidth} pixels`} tabIndex={0}
        title="Arraste para ajustar. Use as setas ou dê dois cliques para restaurar."
        onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) resizeSidebar(event.clientX - event.currentTarget.parentElement!.getBoundingClientRect().left);
        }}
        onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onPointerCancel={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onDoubleClick={() => resizeSidebar(DEFAULT_SIDEBAR_WIDTH)}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 40 : 10;
          const next = { ArrowLeft: sidebarWidth - step, ArrowRight: sidebarWidth + step, Home: MIN_SIDEBAR_WIDTH, End: maxWidth }[event.key];
          if (next !== undefined) { event.preventDefault(); resizeSidebar(next); }
        }}
      />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {deleting && <ConfirmDelete title="Apagar esta conversa?" name={deleting.title} description="As mensagens desta conversa serão apagadas. Os arquivos da pasta serão preservados. Esta ação não pode ser desfeita."
        button="Apagar chat" onClose={() => setDeleting(null)} onConfirm={() => state.deleteChat(deleting.id)} />}
    </aside>
  );
}
