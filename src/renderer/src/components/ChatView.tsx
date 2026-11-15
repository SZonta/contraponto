import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AgentId, ApprovalRequest, Chat, StoredEntry } from '@shared/types';
import { AGENT_LABELS, api, localImageUrl } from '../lib';

const AGENT_COLOR: Record<AgentId, string> = { claude: 'text-claude', codex: 'text-codex' };

function AgentName({ agent }: { agent: AgentId }) {
  return <div className={`mb-1 text-xs font-semibold ${AGENT_COLOR[agent]}`}>{AGENT_LABELS[agent]}</div>;
}

function Collapsible({ summary, children }: { summary: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded border border-line bg-panel">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left">
        <span className="text-muted">{open ? '▾' : '▸'}</span>
        {summary}
      </button>
      {open && <div className="border-t border-line px-3 py-2">{children}</div>}
    </div>
  );
}

function EntryView({ entry }: { entry: StoredEntry }) {
  switch (entry.kind) {
    case 'user':
      return (
        <div className="ml-auto max-w-[80%] rounded-lg bg-raised px-3.5 py-2.5">
          <div className="whitespace-pre-wrap">{entry.text}</div>
          {entry.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {entry.attachments.map((file) =>
                file.mimeType.startsWith('image/') ? (
                  <img key={file.path} src={localImageUrl(file.path)} alt={file.name} className="h-20 rounded" />
                ) : (
                  <span key={file.path} className="rounded bg-panel px-2 py-0.5 text-xs text-muted">
                    📎 {file.name}
                  </span>
                ),
              )}
            </div>
          )}
        </div>
      );
    case 'assistant':
      return (
        <div>
          <AgentName agent={entry.agent} />
          <div className="markdown">
            <Markdown remarkPlugins={[remarkGfm]}>{entry.text}</Markdown>
          </div>
        </div>
      );
    case 'tool': {
      const icon = entry.status === 'running' ? '⏳' : entry.status === 'done' ? '✓' : '✗';
      return (
        <Collapsible
          summary={
            <span className="flex min-w-0 items-center gap-2 text-xs">
              <span className={entry.status === 'failed' ? 'text-red-400' : 'text-muted'}>{icon}</span>
              <span className={`font-semibold ${AGENT_COLOR[entry.agent]}`}>{entry.name}</span>
              <span className="truncate font-mono text-muted">{entry.detail}</span>
            </span>
          }
        >
          <pre className="max-h-64 overflow-auto font-mono text-xs whitespace-pre-wrap text-muted">{entry.output || 'Sem saída.'}</pre>
        </Collapsible>
      );
    }
    case 'fileChange':
      return (
        <Collapsible
          summary={
            <span className="text-xs">
              <span className={`font-semibold ${AGENT_COLOR[entry.agent]}`}>Arquivos alterados:</span>{' '}
              <span className="font-mono text-muted">{entry.paths.join(', ')}</span>
            </span>
          }
        >
          <pre className="max-h-80 overflow-auto font-mono text-xs whitespace-pre">{entry.diff || 'Diff indisponível.'}</pre>
        </Collapsible>
      );
    case 'image':
      return (
        <div>
          <AgentName agent={entry.agent} />
          <img src={localImageUrl(entry.path)} alt={entry.prompt ?? 'Imagem gerada'} className="max-h-80 rounded border border-line" />
          {entry.prompt && <div className="mt-1 text-xs text-muted">{entry.prompt}</div>}
        </div>
      );
    case 'error':
      return (
        <div className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          <span className="font-semibold">{AGENT_LABELS[entry.agent]}:</span> {entry.message}
        </div>
      );
    case 'turnEnd':
      return entry.status === 'interrupted' ? <div className="text-center text-xs text-muted">— interrompido —</div> : null;
  }
}

function ApprovalCard({ request }: { request: ApprovalRequest }) {
  return (
    <div className="rounded-lg border border-amber-700 bg-amber-950/30 p-3">
      <div className="text-sm font-semibold">
        <span className={AGENT_COLOR[request.agent]}>{AGENT_LABELS[request.agent]}</span> pede permissão: {request.title}
      </div>
      <pre className="mt-2 max-h-40 overflow-auto rounded bg-ink px-2 py-1.5 font-mono text-xs whitespace-pre-wrap">{request.detail}</pre>
      <div className="mt-3 flex gap-2">
        <button onClick={() => api.resolveApproval(request.id, 'allow')} className="rounded bg-emerald-700 px-3 py-1 text-sm hover:bg-emerald-600">
          Permitir
        </button>
        <button onClick={() => api.resolveApproval(request.id, 'allowSession')} className="rounded bg-raised px-3 py-1 text-sm hover:bg-line">
          Permitir nesta sessão
        </button>
        <button onClick={() => api.resolveApproval(request.id, 'deny')} className="rounded bg-raised px-3 py-1 text-sm text-red-300 hover:bg-line">
          Negar
        </button>
      </div>
    </div>
  );
}

type Props = {
  chat: Chat;
  entries: StoredEntry[] | undefined;
  live: { agent: AgentId; text: string } | undefined;
  running: boolean;
  approvals: ApprovalRequest[];
};

export function ChatView({ chat, entries, live, running, approvals }: Props) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [entries?.length, live?.text, approvals.length]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-5 py-5">
        {entries?.length === 0 && !running && (
          <div className="py-16 text-center text-muted">
            Escreva a primeira mensagem para o {AGENT_LABELS[chat.agent]}.
          </div>
        )}
        {entries?.map((entry) => <EntryView key={entry.id} entry={entry} />)}
        {live && (
          <div>
            <AgentName agent={live.agent} />
            <div className="markdown">
              <Markdown remarkPlugins={[remarkGfm]}>{live.text}</Markdown>
            </div>
          </div>
        )}
        {approvals.map((request) => (
          <ApprovalCard key={request.id} request={request} />
        ))}
        {running && !live && approvals.length === 0 && (
          <div className={`animate-pulse text-xs ${AGENT_COLOR[chat.agent]}`}>{AGENT_LABELS[chat.agent]} está trabalhando…</div>
        )}
        <div ref={bottom} />
      </div>
    </div>
  );
}
