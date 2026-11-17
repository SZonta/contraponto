import type { AgentId, Project } from '@shared/types';
import { Checkpoints } from '../checkpoints/checkpoints';
import type { Store, TimelineEntry } from '../storage/store';

const AGENT_NAMES: Record<string, string> = { claude: 'Claude', codex: 'Codex', user: 'Usuário' };
const MAX_ENTRIES = 10;

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function listFiles(files: string[]): string {
  if (!files.length) return 'nenhum arquivo';
  return files.length > 8 ? `${files.slice(0, 8).join(', ')} e mais ${files.length - 8}` : files.join(', ');
}

/**
 * What the other agent (and the user, outside the agents) changed since `agent` last worked in
 * the project. Goes at the start of the message, so each agent sees the other's work.
 */
export function buildCrossSummary(timeline: TimelineEntry[], agent: AgentId, outsideFiles: string[]): string | null {
  let lastOwn = -1;
  timeline.forEach((entry, index) => {
    if (entry.agent === agent) lastOwn = index;
  });
  const others = timeline
    .slice(lastOwn + 1)
    .filter((entry) => entry.agent !== agent)
    .slice(-MAX_ENTRIES);
  if (!others.length && !outsideFiles.length) return null;

  const lines = others.map((entry) => {
    const time = new Date(entry.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const undone = entry.undone ? ' (depois desfeito pelo usuário)' : '';
    return `- ${AGENT_NAMES[entry.agent] ?? entry.agent} às ${time}${undone}: pedido "${clip(entry.prompt, 200)}"; resultado "${clip(entry.result, 300)}"; arquivos: ${listFiles(entry.files)}`;
  });
  if (outsideFiles.length) lines.push(`- Alterados fora das IAs (pelo usuário ou por outro programa): ${listFiles(outsideFiles)}`);

  return [
    '[Contexto do Contraponto: o que mudou neste projeto desde a sua última participação]',
    ...lines,
    '[Fim do contexto. Considere essas mudanças antes de agir.]',
  ].join('\n');
}

/** Checkpoints and timeline entries for the projects; one shadow repository per project. */
export class Timeline {
  private readonly checkpoints = new Map<string, Checkpoints>();

  constructor(
    private readonly store: Store,
    private readonly repoFor: (projectId: string) => string,
  ) {}

  begin(project: Project): Promise<string> {
    return this.forProject(project).snapshot('before turn');
  }

  async crossSummary(project: Project, agent: AgentId, beforeRef: string, includeOutside = true): Promise<string | null> {
    const timeline = this.store.listTimeline(project.id);
    const lastAfter = timeline.at(-1)?.afterRef;
    const outside = includeOutside && lastAfter ? await this.forProject(project).changes(lastAfter, beforeRef) : [];
    return buildCrossSummary(
      timeline,
      agent,
      outside.map((change) => change.path),
    );
  }

  async finish(
    project: Project,
    turn: { chatId: string; agent: AgentId; prompt: string; result: string; beforeRef: string },
  ): Promise<TimelineEntry> {
    const checkpoints = this.forProject(project);
    const afterRef = await checkpoints.snapshot('after turn');
    const files = (await checkpoints.changes(turn.beforeRef, afterRef)).map((change) => change.path);
    return this.store.addTimeline({ projectId: project.id, ...turn, files, afterRef });
  }

  /** Only the most recent turn can be undone, and only while its files are still as it left them. */
  async undo(project: Project, timelineId: string): Promise<string[]> {
    const timeline = this.store.listTimeline(project.id);
    const entry = timeline.find((item) => item.id === timelineId);
    if (!entry) throw new Error('Turno não encontrado.');
    if (entry.undone) throw new Error('Este turno já foi desfeito.');
    if (timeline.at(-1)?.id !== entry.id) throw new Error('Só dá para desfazer o turno mais recente desta pasta.');
    const checkpoints = this.forProject(project);
    const now = await checkpoints.snapshot('before undo');
    if ((await checkpoints.changes(entry.afterRef, now)).length) {
      throw new Error('Os arquivos mudaram depois deste turno; desfazer agora apagaria essas mudanças.');
    }
    const restored = await checkpoints.restore(entry.beforeRef, entry.afterRef);
    this.store.markTimelineUndone(entry.id);
    // Record the state after undoing, so the next turn does not report it as an outside change.
    const afterUndo = await checkpoints.snapshot('after undo');
    this.store.addTimeline({
      projectId: project.id,
      chatId: entry.chatId,
      agent: 'user',
      prompt: 'Desfazer turno',
      result: `Desfeito o turno do ${AGENT_NAMES[entry.agent] ?? entry.agent}`,
      files: restored.map((change) => change.path),
      beforeRef: now,
      afterRef: afterUndo,
    });
    return restored.map((change) => change.path);
  }

  private forProject(project: Project): Checkpoints {
    let checkpoints = this.checkpoints.get(project.id);
    if (!checkpoints) {
      checkpoints = new Checkpoints(this.repoFor(project.id), project.path);
      this.checkpoints.set(project.id, checkpoints);
    }
    return checkpoints;
  }
}
