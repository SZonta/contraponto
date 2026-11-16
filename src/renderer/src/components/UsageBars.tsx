import { useEffect, useState } from 'react';
import type { AgentId, AgentUsage, UsageWindow } from '@shared/types';
import { AGENT_LABELS } from '../lib';
import { quotaPercent, quotaReset, quotaResetDate } from '../usage';

function Meter({ label, value, agent }: { label: string; value: UsageWindow | null | undefined; agent: string }) {
  const percent = quotaPercent(value);
  const color = percent !== null && percent >= 90 ? 'bg-red-400' : percent !== null && percent >= 70 ? 'bg-amber-400' : 'bg-codex';
  return <span role="progressbar" aria-label={agent + ': uso ' + label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}
    aria-valuetext={percent === null ? 'Uso não informado' : percent + '% utilizado'} className="usage-meter">
    <span className={color} style={{ width: (percent ?? 0) + '%' }} />
  </span>;
}

function AgentQuota({ agent, report, now }: { agent: AgentId; report?: AgentUsage; now: number }) {
  const name = AGENT_LABELS[agent];
  const id = 'quota-' + agent;
  const periods = [['5 horas', report?.fiveHour], ['Semana', report?.week]] as const;
  const summary = periods.map(([label, value]) => label + ': ' + (quotaPercent(value) === null ? 'uso não informado' : quotaPercent(value) + '% utilizado') + '. ' + quotaReset(value, now)).join('. ');
  return <div className={'quota-root quota-' + agent}>
    <button type="button" className="usage-card" popoverTarget={id} aria-controls={id} aria-label={'Cotas de ' + name + '. ' + summary + '. Abrir detalhes'}>
      <span className="usage-name-row"><span className={'usage-name ' + (agent === 'claude' ? 'text-claude' : 'text-codex')}>{name}</span><span className="usage-chevron" aria-hidden="true">⌄</span></span>
      <span className="usage-windows">{periods.map(([label, value]) => <span key={label} className="usage-window">
        <span className="usage-value"><span>{label}</span><strong>{quotaPercent(value) === null ? '—' : quotaPercent(value) + '%'}</strong></span>
        <Meter label={label} value={value} agent={name} />
        <span className="usage-reset">{quotaReset(value, now)}</span>
      </span>)}</span>
    </button>
    <div id={id} popover="auto" role="region" aria-label={'Detalhes das cotas de ' + name} className="usage-popover">
      <div className="usage-detail-heading"><strong className={agent === 'claude' ? 'text-claude' : 'text-codex'}>{name}</strong><span>Limites do plano</span>
        <button type="button" popoverTarget={id} popoverTargetAction="hide" aria-label={'Fechar cotas de ' + name} title="Fechar" className="icon-button">×</button>
      </div>
      {periods.map(([label, period]) => {
        const percent = quotaPercent(period);
        const date = quotaResetDate(period);
        return <section key={label} className="usage-detail-period">
          <div className="usage-detail-value"><strong>{label === 'Semana' ? 'Uso semanal' : 'Janela de 5 horas'}</strong><span>{percent === null ? 'Sem dados' : percent + '% utilizado'}</span></div>
          <Meter label={label} value={period} agent={name} />
          <p className="usage-detail-date">{date ?? (period ? 'O serviço ainda não informou o horário desta janela.' : 'O serviço ainda não forneceu dados desta janela.')}</p>
          {date && <p className="usage-detail-remaining">{quotaReset(period, now)}{percent !== null ? ' · ' + (100 - percent) + '% disponível' : ''}</p>}
        </section>;
      })}
      <p className="usage-detail-note">São cotas do plano, não uma contagem de tokens. Os limites de 5 horas e da semana são independentes. Horários no fuso deste computador.</p>
    </div>
  </div>;
}

export function UsageBars({ usage }: { usage: AgentUsage[] }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  return <div className="usage-overview" aria-label="Uso dos planos">
    <AgentQuota agent="claude" report={usage.find((item) => item.agent === 'claude')} now={now} />
    <span className="usage-divider" aria-hidden="true" />
    <AgentQuota agent="codex" report={usage.find((item) => item.agent === 'codex')} now={now} />
  </div>;
}
