import { ChatView } from './components/ChatView';
import { Composer } from './components/Composer';
import { Sidebar } from './components/Sidebar';
import { UsageBars } from './components/UsageBars';
import { useAppState } from './useAppState';
import { SchedulesView } from './components/SchedulesView';
import { EMPTY_DRAFT } from './ux';

export function App() {
  const state = useAppState();
  const chat = state.chats.find((item) => item.id === state.chatId) ?? null;
  const project = state.projects.find((item) => item.id === state.projectId) ?? null;

  return (
    <div className="flex h-full overflow-hidden">
      <a href="#conversation" className="skip-link">Ir para a conversa</a>
      <Sidebar state={state} />
      <main id="conversation" tabIndex={-1} className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="app-header flex shrink-0 items-center gap-4 border-b border-line px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{state.schedulesOpen ? 'Agendamentos' : chat?.title ?? 'Contraponto'}</div>
            <div className="truncate text-xs text-muted" title={project?.path}>{project?.name ?? 'Seu próximo projeto começa aqui'}</div>
          </div>
          <UsageBars usage={state.usage} />
        </header>
        {state.allApprovals.some((request) => request.chatId !== chat?.id) && <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-700 bg-amber-950/25 px-5 py-2 text-sm text-amber-100">
          <span>Há uma aprovação esperando em outra conversa.</span><button onClick={() => void state.openPendingApproval()} className="secondary-button shrink-0 text-xs">Abrir pedido</button>
        </div>}
        {state.error && <div role="alert" className="flex items-center gap-3 border-b border-red-800 bg-red-950/40 px-5 py-3 text-sm text-red-200">
          <span className="min-w-0 flex-1 break-words">Não foi possível concluir a ação. {state.error}</span>
          <button onClick={state.reload} className="secondary-button shrink-0">Tentar novamente</button>
          <button onClick={state.clearError} aria-label="Fechar aviso" className="icon-button">×</button>
        </div>}
        {state.loading ? <div role="status" className="m-auto text-muted">Carregando seus projetos…</div> : state.error && !state.projects.length ? <div className="m-auto p-6 text-center text-sm text-muted">Não foi possível abrir seus projetos. Use Tentar novamente no aviso acima.</div> : state.schedulesOpen ? <SchedulesView state={state} /> : chat ? (
          <>
            <ChatView
              chat={chat}
              entries={state.entries}
              loadError={state.entryError}
              onReload={state.reload}
              live={state.live}
              running={state.running.has(chat.id)}
              approvals={state.approvals}
              projectPath={project?.path ?? ''}
            />
            <Composer
              key={chat.id}
              chat={chat}
              models={state.models}
              modelErrors={state.modelErrors}
              retryModels={state.loadModels}
              draft={state.drafts[chat.id] ?? EMPTY_DRAFT}
              onDraft={(draft) => state.updateDraft(chat.id, draft)}
              running={state.running.has(chat.id)}
              onChange={(settings) => state.updateChat(chat.id, settings)}
            />
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="text-xl font-semibold">{project ? 'Tudo pronto para conversar' : 'Duas IAs. Um projeto de cada vez.'}</div>
            <p className="max-w-sm text-sm leading-relaxed text-muted">{project ? 'Comece com um pedido pequeno. Você escolhe quem responde e aprova as ações.' : 'Escolha a pasta em que quer trabalhar. Depois, crie um chat com Claude, Codex ou os dois.'}</p>
            <button onClick={project ? state.createChat : state.addProject} className="primary-button">{project ? '+ Novo chat' : '+ Adicionar pasta'}</button>
          </div>
        )}
      </main>
    </div>
  );
}
