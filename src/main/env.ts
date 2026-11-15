/**
 * The Claude desktop app injects CLAUDE_* and ANTHROPIC_* variables (auth
 * proxy, session ids, "simple" mode) into processes it starts. Child agents
 * must not inherit them, or they would use the host session instead of the
 * user's own CLI login. Called once at startup, before any agent is spawned.
 */
export function stripHostAgentEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (/^(CLAUDE|ANTHROPIC)/i.test(key)) delete process.env[key];
  }
}
