import type { AgentId, AgentMode } from '@shared/types';

export const api = window.contraponto;

export const AGENT_LABELS: Record<AgentId, string> = { claude: 'Claude', codex: 'Codex' };

export const MODE_LABELS: Record<AgentMode, string> = { ...AGENT_LABELS, auto: 'Automático' };

export { imageSource, localImageUrl } from '@shared/image-source';
