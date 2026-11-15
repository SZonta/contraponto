import type { AgentId, AgentUsage, UiEvent } from '@shared/types';
import type { Store } from '../storage/store';

const SETTING_KEY = 'usage';

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

  update(agent: AgentId, usage: Omit<AgentUsage, 'agent'>): void {
    const previous = this.usage[agent];
    // A partial report must not erase a window we already know.
    const next: AgentUsage = {
      agent,
      fiveHour: usage.fiveHour ?? previous?.fiveHour ?? null,
      week: usage.week ?? previous?.week ?? null,
      observedAt: usage.observedAt,
    };
    this.usage[agent] = next;
    this.store.setSetting(SETTING_KEY, this.usage);
    this.emit({ type: 'usage', usage: next });
  }
}
