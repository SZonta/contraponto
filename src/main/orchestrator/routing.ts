import type { AgentId, AgentMode, AgentUsage, AppSettings, RoutingRule } from '@shared/types';

export const DEFAULT_SETTINGS: AppSettings = {
  routingRules: [
    { taskType: 'Planejamento e arquitetura', agent: 'claude' },
    { taskType: 'Código e lógica de jogo', agent: 'claude' },
    { taskType: 'Bugs e testes', agent: 'claude' },
    { taskType: 'Automações e scripts', agent: 'claude' },
    { taskType: 'Modelagem 3D (Blender)', agent: 'codex' },
    { taskType: 'Texturas e imagens', agent: 'codex' },
    { taskType: 'Design de interface e visual', agent: 'codex' },
  ],
  quotaSwitch: { enabled: true, threshold: 90 },
};

export type Route = {
  agent: AgentId;
  /** Claude leads and may call delegate_to_codex. */
  delegate: boolean;
  /** Codex is past the quota threshold: the delegate tool refuses. */
  codexBlocked: boolean;
  notice?: string;
};

function overQuota(usage: AgentUsage | undefined, threshold: number): number | null {
  const percents = [usage?.fiveHour?.usedPercent, usage?.week?.usedPercent].filter((value): value is number => value !== undefined);
  const highest = percents.length ? Math.max(...percents) : null;
  return highest !== null && highest >= threshold ? highest : null;
}

/** Decides who answers a message: an @mention wins, then the chat's selector. */
export function decideRoute(mode: AgentMode, text: string, usage: AgentUsage[], settings: AppSettings): Route {
  const mentionsClaude = /@claude\b/i.test(text);
  const mentionsCodex = /@codex\b/i.test(text);
  if (mentionsCodex && !mentionsClaude) return { agent: 'codex', delegate: false, codexBlocked: false };
  if (mentionsClaude && !mentionsCodex) return { agent: 'claude', delegate: false, codexBlocked: false };
  if (mode !== 'auto') return { agent: mode, delegate: false, codexBlocked: false };

  const { enabled, threshold } = settings.quotaSwitch;
  const claudeOver = enabled ? overQuota(usage.find((item) => item.agent === 'claude'), threshold) : null;
  const codexOver = enabled ? overQuota(usage.find((item) => item.agent === 'codex'), threshold) : null;
  if (claudeOver !== null && codexOver === null) {
    return {
      agent: 'codex',
      delegate: false,
      codexBlocked: false,
      notice: `O Claude está com ${claudeOver}% de uso (limite configurado: ${threshold}%). O Codex assume esta mensagem.`,
    };
  }
  return { agent: 'claude', delegate: true, codexBlocked: codexOver !== null };
}

export function routingInstructions(rules: RoutingRule[]): string {
  const table = rules.map((rule) => `- ${rule.taskType}: ${rule.agent === 'claude' ? 'você (Claude)' : 'Codex'}`).join('\n');
  return [
    'Você está no modo Automático do Contraponto e lidera a tarefa. O Codex, outro agente de IA que trabalha na mesma pasta, está disponível pela ferramenta delegate_to_codex.',
    'Tabela do usuário para decidir quem executa cada parte:',
    table,
    'Para as partes atribuídas ao Codex, chame delegate_to_codex com um briefing completo e autocontido: contexto, arquivos envolvidos e onde salvar o resultado. Não faça essas partes você mesmo, a menos que a ferramenta responda que o Codex está indisponível.',
    'Tipos de tarefa fora da tabela: você decide. Quando o Codex terminar, confira o resultado e integre com o resto do trabalho.',
  ].join('\n');
}
