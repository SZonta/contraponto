/**
 * Makes Claude's subagents (Task/Agent tool, including the built-in Explore, which otherwise
 * runs on Opus) use the model and effort the user picked for Claude in the chat.
 * Codex needs nothing similar: its subagents inherit the parent's model and effort by default.
 */
export function claudeSubagentEnv(model: string | null, effort: string | null): Record<string, string> {
  const env: Record<string, string> = {};
  if (model && model !== 'default') {
    env.CLAUDE_CODE_SUBAGENT_MODEL = model;
    env.CLAUDE_CODE_SUBAGENT_MODEL_FORCE = '1';
  }
  // Takes precedence over a subagent's own effort field and over the per-call effort parameter.
  if (effort) env.CLAUDE_CODE_EFFORT_LEVEL = effort;
  return env;
}
