/**
 * Desktop hosts inject auth proxies, session ids and registered launch bridges.
 * In particular, a standalone Codex CLI cannot use the Codex desktop app's Core
 * launcher identity. Child agents
 * must not inherit them, or they would use the host session instead of the
 * user's own CLI login. Called once at startup, before any agent is spawned.
 */
export function stripHostAgentEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (isHostAgentVariable(key)) delete process.env[key];
  }
}

export function isHostAgentVariable(key: string): boolean {
  return /^(CLAUDE|ANTHROPIC)/i.test(key) ||
    /^CODEX_(APP_|WINDOWS_REGISTERED_CORE$|WINDOWS_SANDBOX_PACKAGE_FAMILY$|PERMISSION_PROFILE$|SESSION_ID$|THREAD_ID$|TOOL_CALL_ID$|TASK_WORKSPACE_VERIFYING_IDENTITY$|SHELL$|INTERNAL_ORIGINATOR_OVERRIDE$)/i.test(key);
}
