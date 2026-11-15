import { createContext, useContext, useEffect, useRef, useState } from 'react';
import Markdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AgentId, ApprovalRequest, Chat, StoredEntry } from '@shared/types';
import { AGENT_LABELS, api, imageSource, localImageUrl } from '../lib';
import { formatDuration, groupWork, readableError, toolLabel, turnActivity, workSummary, type WorkEntry } from '../ux';
import { ImageViewer, type ViewedImage } from './ImageViewer';

const AGENT_COLOR: Record<AgentId, string> = { claude: 'text-claude', codex: 'text-codex' };
function AgentName({ agent }: { agent: AgentId }) {
  return <div className={`mb-1.5 flex items-center gap-2 text-[13px] font-semibold ${AGENT_COLOR[agent]}`}><span aria-hidden="true">●</span>{AGENT_LABELS[agent]}</div>;
}
function Spinner() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="note-pulse inline-block h-4 w-4 shrink-0">
    {[3, 8, 13, 18].map((x, index) => <rect key={x} x={x} y="5" width="3" height="14" rx="1.5" fill={index % 2 ? 'var(--color-codex)' : 'var(--color-claude)'} />)}
  </svg>;
}
function Collapsible({ summary, children }: { summary: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <div className="overflow-hidden rounded-lg border border-line bg-panel">
    <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2 text-left">
      <span aria-hidden="true" className="text-muted">{open ? '▾' : '▸'}</span>{summary}
    </button>
    {open && <div className="border-t border-line px-3 py-3">{children}</div>}
  </div>;
}
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);
  return now;
}
/** A run of tool calls as one line: spinner with the current action while it runs, a summary when done; details on demand. */
function WorkGroup({ items, endAt, active, projectPath }: { items: WorkEntry[]; endAt: number | null; active: boolean; projectPath: string }) {
  const [open, setOpen] = useState(false);
  const now = useNow(active);
  const current = active ? items.findLast((item) => item.kind === 'tool' && item.status === 'running') : undefined;
  const agent = (current ?? items.at(-1)!).agent;
  const elapsed = (active ? now : endAt ?? items.at(-1)!.createdAt) - items[0].createdAt;
  const summary = workSummary(items);
  return <div>
    <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full min-w-0 items-center gap-2 py-1 text-left text-xs">
      {active ? <span className={AGENT_COLOR[agent]}><Spinner /></span> : <span aria-hidden="true" className="w-3.5 shrink-0 text-center text-muted">✓</span>}
      <span className={`shrink-0 font-semibold ${AGENT_COLOR[agent]}`}>{AGENT_LABELS[agent]}</span>
      {current?.kind === 'tool'
        ? <><span className="shrink-0">{toolLabel(current.name)}</span><span className="min-w-0 truncate font-mono text-muted">{current.detail}</span></>
        : <span className="text-muted">{summary.text}{summary.failed > 0 && <span className="text-red-300"> · {summary.failed} não {summary.failed === 1 ? 'concluída' : 'concluídas'}</span>}</span>}
      {elapsed >= 1000 && <span className="shrink-0 text-muted">{formatDuration(elapsed)}</span>}
      <span aria-hidden="true" className="shrink-0 text-muted">{open ? '▾' : '›'}</span>
    </button>
    {open && <div className="mt-2 flex flex-col gap-2 border-l border-line pl-3">
      {items.map((item) => <EntryView key={item.id} entry={item} latest={false} pending={false} projectPath={projectPath} />)}
    </div>}
  </div>;
}
const OpenImage = createContext<(image: ViewedImage) => void>(() => {});
function ChatImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  const open = useContext(OpenImage);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (failed) return <div className="rounded border border-line bg-panel p-3 text-sm text-muted">Imagem indisponível. Confira se o arquivo ainda existe.
    <button className="ml-2 underline" onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}>Tentar carregar novamente</button>
  </div>;
  return <button type="button" className="image-button cursor-zoom-in" onClick={() => open({ src, alt })} aria-label={`Ampliar imagem: ${alt || 'imagem do chat'}`} title="Ampliar imagem">
    <img key={attempt} src={src} alt={alt} className={className} onError={() => setFailed(true)} />
  </button>;
}
function Answer({ text, projectPath }: { text: string; projectPath: string }) {
  return <div className="markdown"><Markdown remarkPlugins={[remarkGfm]}
    urlTransform={(url, key) => key === 'src' ? imageSource(url, projectPath) : defaultUrlTransform(url)}
    components={{ img: ({ src, alt }) => <span className="my-2 block"><ChatImage src={src as string} alt={alt ?? ''} className="max-h-96 rounded border border-line" />{alt && <span className="mt-1 block text-xs text-muted">{alt}</span>}</span> }}>
    {text}
  </Markdown></div>;
}
function EntryView({ entry, latest, pending, projectPath }: { entry: StoredEntry; latest: boolean; pending: boolean; projectPath: string }) {
  switch (entry.kind) {
    case 'user': return <div className="ml-auto max-w-[88%] rounded-xl bg-raised px-4 py-3">
      <div className="mb-1 text-xs font-semibold text-muted">Você</div><div className="whitespace-pre-wrap break-words leading-relaxed">{entry.text}</div>
      {!!entry.attachments.length && <div className="mt-2 flex flex-wrap gap-2">{entry.attachments.map((file) => file.mimeType.startsWith('image/')
        ? <ChatImage key={file.path} src={localImageUrl(file.path)} alt={file.name} className="h-20 rounded" />
        : <span key={file.path} className="rounded bg-panel px-2 py-1 text-xs text-muted">📎 {file.name}</span>)}</div>}
    </div>;
    case 'assistant': return <div><AgentName agent={entry.agent} /><Answer text={entry.text} projectPath={projectPath} /></div>;
    case 'tool': return <Collapsible summary={<span className="min-w-0 flex-1 text-xs">
      <span className={`font-semibold ${AGENT_COLOR[entry.agent]}`}>{AGENT_LABELS[entry.agent]}</span>
      <span className="ml-2">{toolLabel(entry.name)}</span>
      <span className={`ml-2 ${entry.status === 'failed' ? 'text-red-300' : 'text-muted'}`}>{entry.status === 'running' ? 'Em andamento' : entry.status === 'done' ? '✓ Concluído' : 'Não concluído'}</span>
    </span>}><p className="mb-2 break-words font-mono text-xs text-muted">{entry.name} · {entry.detail}</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{entry.output || (entry.status === 'running' ? 'Aguardando o resultado…' : 'Sem saída de texto.')}</pre></Collapsible>;
    case 'fileChange': return <Collapsible summary={<span className="min-w-0 text-xs"><span className={`font-semibold ${AGENT_COLOR[entry.agent]}`}>{AGENT_LABELS[entry.agent]}</span><span className="ml-2">Arquivos alterados</span><span className="ml-2 break-all text-muted">{entry.paths.join(', ')}</span></span>}>
      <pre className="max-h-80 overflow-auto whitespace-pre font-mono text-xs">{entry.diff || 'A lista está disponível; o diff não foi informado.'}</pre>
    </Collapsible>;
    case 'image': return <div><AgentName agent={entry.agent} /><ChatImage src={localImageUrl(entry.path)} alt={entry.prompt ?? 'Imagem gerada'} className="max-h-80 rounded border border-line" />{entry.prompt && <div className="mt-2 text-xs text-muted">{entry.prompt}</div>}</div>;
    case 'error': return <div role="alert" className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-200">
      <p className="font-semibold">{AGENT_LABELS[entry.agent]} não concluiu esta etapa</p><p className="mt-1 break-words leading-relaxed">{entry.message}</p><p className="mt-2 text-xs">Confira os detalhes e envie uma nova mensagem para continuar.</p>
    </div>;
    case 'notice': return <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs leading-relaxed text-muted"><span className="mr-2 font-semibold">Aviso</span>{entry.text}</div>;
    case 'turnEnd': return <TurnEnd entry={entry} latest={latest} pending={pending} />;
  }
}
/** pending: the turn answered, but work it started is still running in the background. */
function TurnEnd({ entry, latest, pending }: { entry: Extract<StoredEntry, { kind: 'turnEnd' }>; latest: boolean; pending: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const files = entry.files ?? [];
  const failed = entry.status === 'failed', interrupted = entry.status === 'interrupted';
  return <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3 text-xs text-muted">
    <span>{entry.undone ? '↶ Turno desfeito' : failed ? 'Turno encerrado com erro' : interrupted ? 'Turno interrompido' : pending ? `${AGENT_LABELS[entry.agent]} respondeu; ainda há trabalho em segundo plano` : `✓ ${AGENT_LABELS[entry.agent]} terminou`}</span>
    {files.length > 0 && <span title={files.join('\n')}>{files.length} {files.length === 1 ? 'arquivo alterado' : 'arquivos alterados'}</span>}
    {!entry.undone && latest && !!files.length && entry.timelineId && <button disabled={undoing} onClick={async () => {
      setUndoing(true); setError(null); try { await api.undoTurn(entry.id); } catch (reason) { setError(readableError(reason)); } finally { setUndoing(false); }
    }} className="secondary-button ml-auto text-xs">{undoing ? 'Desfazendo…' : 'Desfazer turno'}</button>}
    {error && <span role="alert" className="w-full text-red-300">{error}</span>}
  </div>;
}
function ApprovalCard({ request }: { request: ApprovalRequest }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolve = async (decision: 'allow' | 'allowSession' | 'deny') => {
    setBusy(true); setError(null);
    try { await api.resolveApproval(request.id, decision); }
    catch (reason) { setError(readableError(reason)); setBusy(false); }
  };
  return <section id={`approval-${request.id}`} aria-label={`Pedido de aprovação do ${AGENT_LABELS[request.agent]}`} className="scroll-mt-3 rounded-lg border border-amber-400 bg-amber-950/25 p-4">
    <p className="text-sm font-semibold"><span className={AGENT_COLOR[request.agent]}>{AGENT_LABELS[request.agent]}</span> aguarda você</p>
    <p className="mt-1 text-sm">{request.title}</p>
    <pre className="mt-3 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-ink p-3 font-mono text-xs">{request.detail}</pre>
    <p className="mt-2 text-xs text-muted">Permitir nesta sessão também autoriza pedidos semelhantes nesta conversa.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button disabled={busy} onClick={() => void resolve('allow')} className="primary-button text-sm">Permitir uma vez</button>
      <button disabled={busy} onClick={() => void resolve('allowSession')} className="secondary-button text-sm">Permitir nesta sessão</button>
      <button disabled={busy} onClick={() => void resolve('deny')} className="secondary-button text-sm text-red-200">Negar</button>
    </div>
    {busy && <p role="status" className="mt-2 text-xs text-muted">Enviando sua decisão…</p>}
    {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
  </section>;
}

type Props = { chat: Chat; entries: StoredEntry[] | undefined; loadError?: string; onReload: () => void; live: { agent: AgentId; text: string } | undefined; running: boolean; background: string[]; approvals: ApprovalRequest[]; projectPath: string };
export function ChatView({ chat, entries, loadError, onReload, live, running, background, approvals, projectPath }: Props) {
  const bottom = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [away, setAway] = useState(false);
  const [viewed, setViewed] = useState<ViewedImage | null>(null);
  const lastTurnEndId = entries?.filter((entry) => entry.kind === 'turnEnd').at(-1)?.id;
  const activity = turnActivity(chat.agent, running, entries, live, approvals, background);
  const busy = activity.kind === 'working' || activity.kind === 'queued' || activity.kind === 'background';
  const blocks = groupWork(entries ?? []);
  const lastBlock = blocks.at(-1);
  // Only the trailing group of a live turn can be in progress; older "running" tools are leftovers of interrupted turns.
  const workActive = running && lastBlock?.kind === 'work';
  useEffect(() => { following.current = true; setAway(false); }, [chat.id]);
  useEffect(() => { if (following.current) bottom.current?.scrollIntoView({ block: 'end' }); }, [entries?.length, live?.text, approvals.length, background.length, chat.id]);
  const showApproval = () => {
    const card = document.getElementById(`approval-${approvals[0]?.id}`);
    card?.scrollIntoView({ block: 'nearest' }); card?.querySelector('button')?.focus();
  };
  return <OpenImage.Provider value={setViewed}>
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className={`flex shrink-0 items-center gap-3 border-b px-5 py-2.5 ${activity.kind === 'approval' ? 'border-amber-700 bg-amber-950/20' : 'border-line bg-panel/40'}`}>
        <div className="min-w-0 flex-1" role="status" aria-live="polite" aria-atomic="true">
          <p className="flex flex-wrap items-center gap-x-2 text-[13px]">{busy && <span className={AGENT_COLOR[activity.agent]}><Spinner /></span>}<span className={`font-semibold ${activity.kind === 'ready' && chat.agent === 'auto' ? 'text-muted' : AGENT_COLOR[activity.agent]}`}>{activity.kind === 'ready' && chat.agent === 'auto' ? 'Automático' : AGENT_LABELS[activity.agent]}</span><span>{activity.title}</span></p>
          <p className="mt-0.5 text-xs text-muted">{activity.detail}</p>
        </div>
        {!!approvals.length && <button onClick={showApproval} className="secondary-button shrink-0 text-xs">Ver pedido{approvals.length > 1 ? ` (${approvals.length})` : ''}</button>}
      </div>
      <div ref={viewport} className="min-h-0 flex-1 overflow-y-auto" onScroll={() => {
        const element = viewport.current!; following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80; setAway(!following.current);
      }}>
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-5 py-5">
          {!entries && (loadError ? <div role="alert" className="rounded-lg border border-red-700 bg-red-950/30 p-4 text-sm text-red-200"><p className="font-semibold">Não foi possível abrir esta conversa.</p><p className="mt-2 break-words">{loadError}</p><button onClick={onReload} className="secondary-button mt-3">Tentar novamente</button></div> : <p role="status" className="py-10 text-center text-sm text-muted">Carregando conversa…</p>)}
          {entries?.length === 0 && !running && <div className="py-8 text-center">
            <h1 className="text-lg font-semibold">Qual é a próxima ação?</h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted">{chat.agent === 'auto' ? 'Descreva o resultado. O Claude organiza o trabalho e delega ao Codex.' : `Peça ao ${AGENT_LABELS[chat.agent]} uma tarefa pequena para começar.`}</p>
            <button onClick={() => document.getElementById('message-input')?.focus()} className="secondary-button mt-4 text-sm">Escrever meu pedido</button>
          </div>}
          {blocks.map((block) => block.kind === 'work'
            ? <WorkGroup key={block.id} items={block.items} endAt={block.endAt} active={workActive && block === lastBlock} projectPath={projectPath} />
            : <EntryView key={block.entry.id} entry={block.entry} latest={block.entry.id === lastTurnEndId} pending={block.entry.id === lastTurnEndId && background.length > 0} projectPath={projectPath} />)}
          {live && <div><AgentName agent={live.agent} /><Answer text={live.text} projectPath={projectPath} /></div>}
          {/* The status bar announces this already; this copy sits where the reader is looking. A running work group shows its own spinner. */}
          {busy && !(workActive && !live) && <div aria-hidden="true" className="flex items-center gap-2 text-xs text-muted">
            <span className={AGENT_COLOR[activity.agent]}><Spinner /></span><span>{activity.title}{activity.kind === 'background' ? `: ${activity.detail}` : '…'}</span>
          </div>}
          {approvals.map((request) => <ApprovalCard key={request.id} request={request} />)}
          <div ref={bottom} />
        </div>
      </div>
      {away && <button onClick={() => { following.current = true; setAway(false); bottom.current?.scrollIntoView({ block: 'end' }); }} className="absolute right-5 bottom-3 rounded-full border border-control bg-panel px-4 py-2 text-xs shadow-lg">Ir para a resposta ↓</button>}
    </div>
    {viewed && <ImageViewer image={viewed} onClose={() => setViewed(null)} />}
  </OpenImage.Provider>;
}
