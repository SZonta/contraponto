import { useCallback, useEffect, useState } from 'react';
import type { AgentId, AgentUsage, ApprovalRequest, Chat, ModelOption, Project, StoredEntry } from '@shared/types';
import { api } from './lib';

type LiveText = { agent: AgentId; text: string };

/** All window state, kept in sync with the main process through UiEvents. */
export function useAppState() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, StoredEntry[]>>({});
  const [live, setLive] = useState<Record<string, LiveText>>({});
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [usage, setUsage] = useState<AgentUsage[]>([]);
  const [models, setModels] = useState<Partial<Record<AgentId, ModelOption[]>>>({});

  useEffect(() => {
    void api.listProjects().then((list) => {
      setProjects(list);
      setProjectId((current) => current ?? list[0]?.id ?? null);
    });
    void api.getUsage().then(setUsage);
    void api.listPendingApprovals().then(setApprovals);
    void api.runningChats().then((ids) => setRunning(new Set(ids)));
    for (const agent of ['claude', 'codex'] as const) {
      api
        .listModels(agent)
        .then((list) => setModels((current) => ({ ...current, [agent]: list })))
        .catch(() => setModels((current) => ({ ...current, [agent]: [] })));
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
          setChats((current) => current.map((chat) => (chat.id === event.chat.id ? event.chat : chat)));
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
        case 'usage':
          setUsage((current) => [...current.filter((item) => item.agent !== event.usage.agent), event.usage]);
          break;
      }
    });
  }, []);

  useEffect(() => {
    if (!projectId) {
      setChats([]);
      return;
    }
    void api.listChats(projectId).then((list) => {
      setChats(list);
      setChatId(list[0]?.id ?? null);
    });
  }, [projectId]);

  useEffect(() => {
    if (!chatId || entries[chatId]) return;
    void api.listEntries(chatId).then((list) => setEntries((current) => ({ ...current, [chatId]: list })));
  }, [chatId, entries]);

  const addProject = useCallback(async () => {
    const project = await api.addProject();
    if (!project) return;
    setProjects(await api.listProjects());
    setProjectId(project.id);
  }, []);

  const createChat = useCallback(async () => {
    if (!projectId) return;
    const chat = await api.createChat(projectId);
    setChats((current) => [chat, ...current]);
    setChatId(chat.id);
  }, [projectId]);

  const updateChat = useCallback(async (id: string, settings: Parameters<typeof api.updateChat>[1]) => {
    const chat = await api.updateChat(id, settings);
    setChats((current) => current.map((item) => (item.id === id ? chat : item)));
  }, []);

  const deleteChat = useCallback(async (id: string) => {
    await api.deleteChat(id);
    setChats((current) => {
      const next = current.filter((chat) => chat.id !== id);
      setChatId((selected) => (selected === id ? (next[0]?.id ?? null) : selected));
      return next;
    });
  }, []);

  return {
    projects,
    projectId,
    setProjectId,
    chats,
    chatId,
    setChatId,
    entries: chatId ? entries[chatId] : undefined,
    live: chatId ? live[chatId] : undefined,
    running,
    approvals: approvals.filter((request) => request.chatId === chatId),
    usage,
    models,
    addProject,
    createChat,
    updateChat,
    deleteChat,
  };
}
