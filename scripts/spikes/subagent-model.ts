// Spike: does the model picked for Claude reach its subagents? Prints the model of every subagent message.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { claudeSubagentEnv } from '../../src/main/agents/claude/subagent-env.js';
import { stripHostAgentEnv } from './lib/env.js';

stripHostAgentEnv();
const workDir = path.resolve('output', 'subagent-work');
mkdirSync(workDir, { recursive: true });
writeFileSync(path.join(workDir, 'a.txt'), 'a');

async function run(label: string, forced: boolean): Promise<void> {
  const models = new Set<string>();
  const session = query({
    prompt: 'Use the Explore agent to list the files in the current folder. Then answer only: ok.',
    options: {
      cwd: workDir,
      // The main agent runs Sonnet; forcing must move the subagents to Haiku.
      model: 'sonnet',
      effort: 'low',
      persistSession: false,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      env: { ...process.env, ...(forced ? claudeSubagentEnv('haiku', 'low') : {}) },
    },
  });
  for await (const message of session) {
    if (message.type === 'assistant' && message.parent_tool_use_id) models.add(message.message.model);
  }
  console.log(`${label}: subagent models = ${[...models].join(', ') || '(no subagent ran)'}`);
}

await run('without forcing', false);
await run('with claudeSubagentEnv("haiku", "low")', true);
