import { useEffect, useRef, useState } from 'react';
import type { AgentId, AgentUsage, UsageWindow } from '@shared/types';
import { AGENT_LABELS, formatReset } from '../lib';

function Meter({ label, value, agent }: { label: string; value: UsageWindow | null; agent: string }) {
  const percent = value ? Math.max(0, Math.min(100, value.usedPercent)) : null;
  const color = percent !== null && percent >= 90 ? 'bg-red-400' : percent !== null && percent >= 70 ? 'bg-amber-400' : 'bg-codex';
  return <span className="block min-w-0 flex-1">
    <span className="flex justify-between gap-1 text-xs"><span className="text-muted">{label}</span><span>{percent === null ? '—' : `${percent}%`}</span></span>
    <span role="progressbar" aria-label={`${agent}: uso ${label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}
      aria-valuetext={percent === null ? 'Sem dados de uso' : `${percent}% usado`} className="mt-1 block h-1 overflow-hidden rounded bg-raised">
      <span className={`block h-full ${color}`} style={{ width: `${percent ?? 0}%` }} />
    </span>
  </span>;
}

function AgentQuota({ agent, report, now }: { agent: AgentId; report?: AgentUsage; now: number }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key); };
  }, [open]);
  const name = AGENT_LABELS[agent];
  const id = `quota-${agent}`;
  return <div className="relative" ref={root}>
    <button className="usage-card" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id} aria-label={`Cotas de ${name}. 5 horas: ${report?.fiveHour ? `${report.fiveHour.usedPercent}% usado` : 'sem dados'}. Semana: ${report?.week ? `${report.week.usedPercent}% usado` : 'sem dados'}. Ver horários de renovação`}>
      <span className="mb-1 flex items-center justify-between text-xs"><span className={`font-semibold ${agent === 'claude' ? 'text-claude' : 'text-codex'}`}>{name}</span><span aria-hidden="true" className="text-muted">{open ? '▴' : '▾'}</span></span>
      <span className="flex gap-3"><Meter label="5h" value={report?.fiveHour ?? null} agent={name} /><Meter label="Semana" value={report?.week ?? null} agent={name} /></span>
    </button>
    {open && <div id={id} role="region" aria-label={`Detalhes das cotas de ${name}`} className="usage-popover">
      <p className="mb-3 text-sm font-semibold">Uso do {name}</p>
      {([['5 horas', report?.fiveHour], ['Semana', report?.week]] as const).map(([label, period]) => <div key={label} className="mt-3 text-xs">
        <p className="flex justify-between"><span>{label}</span><span>{period ? `${period.usedPercent}% usado` : 'Sem dados'}</span></p>
        <p className="mt-1 text-muted">{period ? formatReset(period.resetsAt, now) || 'Horário de renovação indisponível' : 'Os dados aparecem quando a IA estiver conectada.'}</p>
      </div>)}
      <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-muted">Cota alta? Escolha outra IA ou aguarde a renovação. A troca automática segue suas Configurações.</p>
    </div>}
  </div>;
}

export function UsageBars({ usage }: { usage: AgentUsage[] }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  return <div className="flex shrink-0 gap-2" aria-label="Uso dos planos">
    {(['claude', 'codex'] as const).map((agent) => <AgentQuota key={agent} agent={agent} report={usage.find((item) => item.agent === agent)} now={now} />)}
  </div>;
}
