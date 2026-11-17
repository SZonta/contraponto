import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentId, AgentUsage, ApprovalRequest, Chat, ModelOption, Project, Schedule, StoredEntry } from '@shared/types';
import { api } from './lib';
import { EMPTY_DRAFT, readableError, type Draft, type DraftUpdate } from './ux';

type LiveText = { agent: AgentId; text: string };

/** All window state, kept in sync with the main process through UiEvents. */
export function useAppState() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, StoredEntry[]>>({});
  const [entryErrors, setEntryErrors] = useState<Record<string, string | undefined>>({});
  const [live, setLive] = useState<Record<string, LiveText>>({});
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [background, setBackground] = useState<Record<string, string[]>>({});
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [usage, setUsage] = useState<AgentUsage[]>([]);
  const [models, setModels] = useState<Partial<Record<AgentId, ModelOption[]>>>({});
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedulesOpen, setSchedulesOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [modelErrors, setModelErrors] = useState<Partial<Record<AgentId, string>>>({});

  const loadModels = useCallback(async (agent: AgentId) => {
    setModelErrors((current) => ({ ...current, [agent]: undefined }));
    setModels((current) => ({ ...current, [agent]: undefined }));
    try {
      const list = await api.listModels(agent);
      setModels((current) => ({ ...current, [agent]: list }));
    } catch {
      setModels((current) => ({ ...current, [agent]: [] }));
      setModelErrors((current) => ({ ...current, [agent]: 'Não foi possível carregar os modelos.' }));
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void Promise.all([api.listProjects(), api.listChats()]).then(([projectList, chatList]) => {
      setProjects(projectList);
      setChats(chatList);
      setChatId((current) => chatList.some((chat) => chat.id === current) ? current : chatList[0]?.id ?? null);
    }).catch((reason) => setError(readableError(reason))).finally(() => setLoading(false));
    void api.getUsage().then(setUsage).catch((reason) => setError(readableError(reason)));
    void api.listPendingApprovals().then(setApprovals).catch((reason) => setError(readableError(reason)));
    void api.runningChats().then((ids) => setRunning(new Set(ids))).catch((reason) => setError(readableError(reason)));
    void api.backgroundTasks().then(setBackground).catch((reason) => setError(readableError(reason)));
    void api.listSchedules().then(setSchedules).catch((reason) => setError(readableError(reason)));
    for (const agent of ['claude', 'codex'] as const) {
      void loadModels(agent);
    }

    return api.onEvent((event) => {
      switch (event.type) {
        case 'textDelta':
          setLive((current) => {
            const previous = current[event.chatId];
            const text = previous?.agent === event.agent ? previous.text + event.text : event.text;
            return { ...current, [event.chatId]: { agent: event.agent, text } };
          });
          break;
        case 'entry': {
          const { entry } = event;
          setEntries((current) => (current[entry.chatId] ? { ...current, [entry.chatId]: [...current[entry.chatId], entry] } : current));
          // A finished message replaces the streamed text.
          if (entry.kind === 'assistant' || entry.kind === 'tool') {
            setLive((current) => {
              const { [entry.chatId]: _done, ...rest } = current;
              return rest;
            });
          }
          break;
        }
        case 'entryUpdated':
          setEntries((current) => {
            const list = current[event.entry.chatId];
            return list ? { ...current, [event.entry.chatId]: list.map((item) => (item.id === event.entry.id ? event.entry : item)) } : current;
          });
          break;
        case 'chatUpdated':
          setChats((current) => current.some((chat) => chat.id === event.chat.id)
            ? current.map((chat) => (chat.id === event.chat.id ? event.chat : chat)) : [event.chat, ...current]);
          break;
        case 'schedulesChanged':
          void api.listSchedules().then(setSchedules).catch((reason) => setError(readableError(reason)));
          break;
        case 'approval':
          setApprovals((current) => [...current, event.request]);
          break;
        case 'approvalResolved':
          setApprovals((current) => current.filter((request) => request.id !== event.id));
          break;
        case 'turnState':
          setRunning((current) => {
            const next = new Set(current);
            if (event.running) next.add(event.chatId);
            else next.delete(event.chatId);
            return next;
          });
          if (!event.running) {
            setLive((current) => {
              const { [event.chatId]: _done, ...rest } = current;
              return rest;
            });
          }
          break;
        case 'background':
          setBackground((current) => {
            const { [event.chatId]: _old, ...rest } = current;
            return event.tasks.length ? { ...rest, [event.chatId]: event.tasks } : rest;
          });
          break;
        case 'usage':
          setUsage((current) => [...current.filter((item) => item.agent !== event.usage.agent), event.usage]);
          break;
      }
    });
  }, [revision, loadModels]);

  useEffect(() => {
    if (!chatId || entries[chatId]) return;
    setEntryErrors((current) => ({ ...current, [chatId]: undefined }));
    void api.listEntries(chatId).then((list) => setEntries((current) => ({ ...current, [chatId]: list })))
      .catch((reason) => setEntryErrors((current) => ({ ...current, [chatId]: readableError(reason) })));
  }, [chatId, entries, revision]);

  /** A chat made with "Novo chat" goes away if the user leaves it before sending anything. */
  const freshChatId = useRef<string | null>(null);
  const discardFresh = useCallback(() => {
    const id = freshChatId.current;
    if (!id) return;
    freshChatId.current = null;
    void api.discardEmptyChat(id).then(async (deleted) => {
      if (!deleted) return;
      setChats((current) => current.filter((chat) => chat.id !== id));
      setProjects(await api.listProjects());
    }).catch((reason) => setError(readableError(reason)));
  }, []);

  useEffect(() => {
    if (freshChatId.current && (freshChatId.current !== chatId || schedulesOpen)) discardFresh();
  }, [chatId, schedulesOpen, discardFresh]);

  /** Without a project, the chat starts with no folder. */
  const createChat = useCallback(async (projectId?: string) => {
    try {
    const chat = await api.createChat(projectId);
    discardFresh();
    freshChatId.current = chat.id;
    setProjects(await api.listProjects());
    setChats((current) => [chat, ...current]);
    setChatId(chat.id);
    setSchedulesOpen(false);
    } catch (reason) { setError(readableError(reason)); }
  }, []);

  const chooseFolder = useCallback(async (id: string) => {
    try {
    const chat = await api.chooseChatFolder(id);
    if (!chat) return;
    setProjects(await api.listProjects());
    setChats((current) => current.map((item) => (item.id === id ? chat : item)));
    } catch (reason) { setError(readableError(reason)); }
  }, []);

  const updateChat = useCallback(async (id: string, settings: Parameters<typeof api.updateChat>[1]) => {
    try {
    const chat = await api.updateChat(id, settings);
    setChats((current) => current.map((item) => (item.id === id ? chat : item)));
    } catch (reason) { setError(readableError(reason)); }
  }, []);

  const deleteChat = useCallback(async (id: string) => {
    try {
    await api.deleteChat(id);
    setChats((current) => {
      const next = current.filter((chat) => chat.id !== id);
      setChatId((selected) => (selected === id ? (next[0]?.id ?? null) : selected));
      return next;
    });
    } catch (reason) { throw new Error(readableError(reason)); }
  }, []);

  return {
    projects,
    chats,
    chatId,
    setChatId,
    entries: chatId ? entries[chatId] : undefined,
    entryError: chatId ? entryErrors[chatId] : undefined,
    live: chatId ? live[chatId] : undefined,
    running,
    background,
    approvals: approvals.filter((request) => request.chatId === chatId),
    allApprovals: approvals,
    openPendingApproval: () => {
      const request = approvals.find((item) => item.chatId !== chatId) ?? approvals[0];
      if (!request) return;
      if (!chats.some((item) => item.id === request.chatId)) { setError('A conversa deste pedido não está mais disponível.'); return; }
      setChatId(request.chatId); setSchedulesOpen(false);
    },
    usage,
    models,
    modelErrors,
    loadModels,
    loading,
    error,
    clearError: () => setError(null),
    reload: () => { setError(null); setRevision((current) => current + 1); },
    drafts,
    updateDraft: (id: string, draft: DraftUpdate) => setDrafts((current) => ({ ...current, [id]: typeof draft === 'function' ? draft(current[id] ?? EMPTY_DRAFT) : draft })),
    schedules,
    schedulesOpen,
    setSchedulesOpen,
    openChat: (id: string) => {
      setChatId(id);
      setSchedulesOpen(false);
    },
    createChat,
    chooseFolder,
    updateChat,
    deleteChat,
  };
}
