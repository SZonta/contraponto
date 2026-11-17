import type { AgentId, AgentUsage, UiEvent, UsageWindow } from '@shared/types';
import type { Store } from '../storage/store';

const SETTING_KEY = 'usage';

/** A window past its reset time no longer limits anything: its report is stale. */
export function isExpired(window: UsageWindow | null | undefined, now: number): boolean {
  return typeof window?.resetsAt === 'number' && window.resetsAt <= now;
}

/** Last known plan usage per agent, kept across restarts so the bars show right away. */
export class UsageService {
  private readonly usage: Partial<Record<AgentId, AgentUsage>>;

  constructor(
    private readonly store: Store,
    private readonly emit: (event: UiEvent) => void,
  ) {
    this.usage = store.getSetting<Partial<Record<AgentId, AgentUsage>>>(SETTING_KEY) ?? {};
  }

  list(): AgentUsage[] {
    return Object.values(this.usage);
  }

  /** Agents whose last report has a window past its reset time. */
  stale(now = Date.now()): AgentId[] {
    return Object.values(this.usage)
      .filter((item) => isExpired(item.fiveHour, now) || isExpired(item.week, now))
      .map((item) => item.agent);
  }

  update(agent: AgentId, usage: Omit<AgentUsage, 'agent'>): void {
    const previous = this.usage[agent];
    // A partial report must not erase a window we already know, unless that window has already reset.
    const keep = (window: UsageWindow | null | undefined) => (isExpired(window, usage.observedAt) ? null : window ?? null);
    const next: AgentUsage = {
      agent,
      fiveHour: usage.fiveHour ?? keep(previous?.fiveHour),
      week: usage.week ?? keep(previous?.week),
      observedAt: usage.observedAt,
    };
    this.usage[agent] = next;
    this.store.setSetting(SETTING_KEY, this.usage);
    this.emit({ type: 'usage', usage: next });
  }
}
