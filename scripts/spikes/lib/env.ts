/**
 * The Claude desktop app injects CLAUDE_* and ANTHROPIC_* variables (auth
 * proxy, session ids, "simple" mode) into the shells it hosts. Child agents
 * must not inherit them, or they would use the host session instead of the
 * user's own CLI login. Contraponto must do the same when it spawns agents.
 */
export function stripHostAgentEnv(): number {
  let removed = 0;
  for (const key of Object.keys(process.env)) {
    if (/^(CLAUDE|ANTHROPIC)/i.test(key)) {
      delete process.env[key];
      removed++;
    }
  }
  return removed;
}
