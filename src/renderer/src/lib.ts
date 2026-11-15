import type { AgentId, AgentMode } from '@shared/types';

export const api = window.contraponto;

export const AGENT_LABELS: Record<AgentId, string> = { claude: 'Claude', codex: 'Codex' };

export const MODE_LABELS: Record<AgentMode, string> = { ...AGENT_LABELS, auto: 'Automático' };

export const MODE_COLORS: Record<AgentMode, string> = { claude: 'text-claude', codex: 'text-codex', auto: 'text-amber-300' };

export { imageSource, localImageUrl } from '@shared/image-source';

export function formatReset(resetsAt: number | null, now = Date.now()): string {
  if (!resetsAt) return '';
  const minutes = Math.max(0, Math.round((resetsAt - now) / 60000));
  if (minutes < 60) return `reseta em ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `reseta em ${hours}h${String(minutes % 60).padStart(2, '0')}`;
  return `reseta em ${Math.floor(hours / 24)}d ${hours % 24}h`;
}
