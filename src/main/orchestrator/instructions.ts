import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAX_CHARS = 20000;

function read(file: string): string | null {
  return existsSync(file) ? readFileSync(file, 'utf8').slice(0, MAX_CHARS) : null;
}

/**
 * Claude reads CLAUDE.md by itself. When a project only has AGENTS.md (Codex's file),
 * its content goes into Claude's instructions instead, so both follow the same rules
 * without the app creating files in the project.
 */
export function projectRulesForClaude(projectPath: string): string | null {
  if (existsSync(path.join(projectPath, 'CLAUDE.md'))) return null;
  const agents = read(path.join(projectPath, 'AGENTS.md'));
  return agents ? `Instruções do projeto (AGENTS.md):\n${agents}` : null;
}

/** The user's global rules live in ~/.claude/CLAUDE.md; Codex receives the same text. */
export function globalRulesForCodex(): string | null {
  const rules = read(path.join(os.homedir(), '.claude', 'CLAUDE.md'));
  return rules ? `Regras globais do usuário:\n${rules}` : null;
}

export const CODEX_TEAM_NOTE =
  'Você trabalha no Contraponto, um app em que o usuário usa você e o Claude na mesma pasta. ' +
  'Mensagens podem começar com um bloco [Contexto do Contraponto] que resume o que o Claude ou o usuário mudaram; ' +
  'leve isso em conta. Tarefas marcadas como [Tarefa delegada pelo Claude] vêm do Claude, que vai conferir e integrar o seu resultado.';

export const IMAGE_DISPLAY_NOTE =
  'No chat do Contraponto, você não anexa arquivos, mas pode mostrar imagens ao usuário: escreva na resposta ' +
  '![descrição](caminho), com o caminho absoluto ou relativo à pasta do projeto. O app exibe a imagem dentro do chat.';

export function joinInstructions(...parts: (string | null | undefined)[]): string | undefined {
  const text = parts.filter(Boolean).join('\n\n');
  return text || undefined;
}
