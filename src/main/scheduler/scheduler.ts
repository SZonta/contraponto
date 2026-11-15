import { randomUUID } from 'node:crypto';
import type { Schedule, ScheduleInput } from '@shared/types';
import type { Store } from '../storage/store';
import { nextOccurrence, validateSchedule } from './schedule';

type RunResult = { chatId: string; status: string };
type Awake = { start(): number; stop(id: number): void };

/** Durable deadlines; a wake/restart coalesces missed occurrences into one turn. */
export class Scheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly active = new Set<string>();
  private stopped = false;

  constructor(
    private readonly store: Store,
    private readonly run: (schedule: Schedule) => Promise<RunResult>,
    private readonly awake: Awake,
    private readonly changed: () => void,
    private readonly now: () => number = Date.now,
  ) {}

  start(): void {
    this.stopped = false;
    for (const schedule of this.store.listSchedules()) {
      if (schedule.lastStatus === 'running') {
        this.store.saveSchedule({ ...schedule, lastStatus: 'interrupted', lastError: 'O app foi encerrado durante a execução. O disparo não será repetido.' });
      }
    }
    this.timer = setInterval(() => void this.tick(), 1000);
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  save(input: ScheduleInput, id?: string): Schedule {
    const clean = validateSchedule(input, this.now());
    if (!this.store.getProject(clean.projectId)) throw new Error('Projeto não encontrado.');
    if (clean.continueChat && this.store.getChat(clean.chatId!)?.projectId !== clean.projectId) throw new Error('O chat precisa pertencer ao projeto escolhido.');
    const old = id ? this.store.listSchedules().find((item) => item.id === id) : undefined;
    if (id && !old) throw new Error('Agendamento não encontrado.');
    const schedule: Schedule = {
      id: id ?? randomUUID(), enabled: old?.enabled ?? true,
      lastRunAt: old?.lastRunAt ?? null, lastChatId: old?.lastChatId ?? null,
      lastStatus: old?.lastStatus ?? 'idle', lastError: old?.lastError ?? null,
      ...clean, nextRunAt: nextOccurrence(clean.trigger, this.now()),
    };
    this.store.saveSchedule(schedule);
    this.changed();
    return schedule;
  }

  pause(id: string, paused: boolean): Schedule {
    const current = this.store.listSchedules().find((item) => item.id === id);
    if (!current) throw new Error('Agendamento não encontrado.');
    const nextRunAt = paused ? current.nextRunAt : nextOccurrence(current.trigger, this.now());
    if (!paused && nextRunAt === null) throw new Error('Edite a data antes de reativar uma tarefa única já vencida.');
    const updated = { ...current, enabled: !paused, nextRunAt };
    this.store.saveSchedule(updated);
    this.changed();
    return updated;
  }

  delete(id: string): void {
    this.store.deleteSchedule(id);
    this.changed();
  }

  async tick(): Promise<void> {
    if (this.stopped) return;
    const now = this.now();
    await Promise.all(this.store.listSchedules()
      .filter((item) => item.enabled && item.nextRunAt !== null && item.nextRunAt <= now && !this.active.has(item.id))
      .map((item) => this.execute(item, now)));
  }

  private async execute(schedule: Schedule, now: number): Promise<void> {
    this.active.add(schedule.id);
    // Persist the claim BEFORE starting: crashes cannot replay a side effect.
    this.store.saveSchedule({ ...schedule, nextRunAt: nextOccurrence(schedule.trigger, now),
      enabled: schedule.trigger.kind !== 'once', lastRunAt: now, lastStatus: 'running', lastError: null });
    this.changed();
    let blocker: number | undefined;
    let result: RunResult | undefined;
    let error: string | null = null;
    try {
      blocker = this.awake.start();
      result = await this.run(schedule);
      if (!['completed', 'success'].includes(result.status)) error = `O turno terminou com estado: ${result.status}.`;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      if (blocker !== undefined) this.awake.stop(blocker);
      this.active.delete(schedule.id);
      if (this.stopped) return;
      // An edit/pause/delete while running must not be undone by completion.
      const current = this.store.listSchedules().find((item) => item.id === schedule.id);
      if (current) this.store.saveSchedule({ ...current, lastChatId: result?.chatId ?? current.lastChatId,
        lastStatus: error ? (result?.status === 'interrupted' ? 'interrupted' : 'failed') : 'completed', lastError: error });
      this.changed();
    }
  }
}
