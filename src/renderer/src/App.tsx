import { ChatView } from './components/ChatView';
import { Composer } from './components/Composer';
import { Sidebar } from './components/Sidebar';
import { UsageBars } from './components/UsageBars';
import { useAppState } from './useAppState';

export function App() {
  const state = useAppState();
  const chat = state.chats.find((item) => item.id === state.chatId) ?? null;
  const project = state.projects.find((item) => item.id === state.projectId) ?? null;

  return (
    <div className="flex h-full">
      <Sidebar state={state} />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-line px-5 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{chat?.title ?? 'Contraponto'}</div>
            <div className="truncate text-xs text-muted">{project?.path ?? 'Adicione uma pasta para começar'}</div>
          </div>
          <UsageBars usage={state.usage} />
        </header>
        {chat ? (
          <>
            <ChatView
              chat={chat}
              entries={state.entries}
              live={state.live}
              running={state.running.has(chat.id)}
              approvals={state.approvals}
              projectPath={project?.path ?? ''}
            />
            <Composer
              chat={chat}
              models={state.models}
              running={state.running.has(chat.id)}
              onChange={(settings) => state.updateChat(chat.id, settings)}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted">
            {project ? 'Crie um chat na barra lateral.' : 'Adicione a pasta de um projeto na barra lateral.'}
          </div>
        )}
      </main>
    </div>
  );
}
