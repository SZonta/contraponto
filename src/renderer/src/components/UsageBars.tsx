import { useEffect, useState } from 'react';
import type { AgentId, AgentUsage, UsageWindow } from '@shared/types';
import { AGENT_LABELS, formatReset } from '../lib';

function barColor(percent: number): string {
  if (percent >= 90) return 'bg-red-500';
  if (percent >= 70) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function Bar({ label, window, now }: { label: string; window: UsageWindow | null; now: number }) {
  const percent = window?.usedPercent ?? 0;
  return (
    <div className="w-36" title={window ? `${label}: ${percent}% usado, ${formatReset(window.resetsAt, now)}` : `${label}: sem dados`}>
      <div className="flex justify-between text-[11px] text-muted">
        <span>
          {label} {window ? `${percent}%` : '—'}
        </span>
        <span>{window ? formatReset(window.resetsAt, now).replace('reseta em ', '↻ ') : ''}</span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-raised">
        <div className={`h-full ${barColor(percent)}`} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
    </div>
  );
}

export function UsageBars({ usage }: { usage: AgentUsage[] }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex gap-5">
      {(['claude', 'codex'] as AgentId[]).map((agent) => {
        const report = usage.find((item) => item.agent === agent);
        return (
          <div key={agent} className="flex items-center gap-2">
            <span className={`text-xs font-semibold ${agent === 'claude' ? 'text-claude' : 'text-codex'}`}>{AGENT_LABELS[agent]}</span>
            <Bar label="5h" window={report?.fiveHour ?? null} now={now} />
            <Bar label="Semana" window={report?.week ?? null} now={now} />
          </div>
        );
      })}
    </div>
  );
}
