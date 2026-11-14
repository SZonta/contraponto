// Spike: Claude through the Agent SDK — streaming, approvals, models and plan usage.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { stripHostAgentEnv } from './lib/env.js';

const removedVars = stripHostAgentEnv();
const PROMPT =
  'Create a file named note.txt containing the word ok, then list the files in the current folder. Answer in one short line.';
const workDir = path.resolve('output', 'claude-work');
mkdirSync(workDir, { recursive: true });
console.log(`removed ${removedVars} host env vars`);

const startedAt = Date.now();
const session = query({
  prompt: PROMPT,
  options: {
    cwd: workDir,
    includePartialMessages: true,
    permissionMode: 'default',
    settingSources: ['user', 'project'],
    effort: 'low',
    maxTurns: 8,
    persistSession: false,
    canUseTool: async (toolName, input) => {
      console.log(`\n[approval] ${toolName}: ${JSON.stringify(input).slice(0, 160)}`);
      return { behavior: 'allow', updatedInput: input };
    },
  },
});

let extras: Promise<void> | undefined;

for await (const message of session) {
  switch (message.type) {
    case 'system':
      if (message.subtype === 'init') {
        console.log(
          `init: model=${message.model} permissionMode=${message.permissionMode} apiKeySource=${message.apiKeySource} version=${message.claude_code_version} (${Date.now() - startedAt} ms)`,
        );
        extras = printUsageAndModels();
      }
      break;
    case 'stream_event':
      if (message.event.type === 'content_block_delta' && message.event.delta.type === 'text_delta') {
        process.stdout.write(message.event.delta.text);
      }
      break;
    case 'assistant':
      for (const block of message.message.content) {
        if (block.type === 'tool_use') console.log(`\n[tool] ${block.name}`);
      }
      break;
    case 'rate_limit_event':
      console.log(`\n[rate_limit_event] ${JSON.stringify(message.rate_limit_info)}`);
      break;
    case 'result':
      console.log(`\n\nresult: ${message.subtype} turns=${message.num_turns} cost_usd=${message.total_cost_usd} duration=${message.duration_ms} ms`);
      console.log(`usage: ${JSON.stringify(message.usage)}`);
      break;
  }
}
await extras;

async function printUsageAndModels(): Promise<void> {
  const usage = await session.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true });
  const limits = usage.rate_limits;
  console.log(`\n[usage] subscription=${usage.subscription_type} available=${usage.rate_limits_available}`);
  console.log(
    `[usage] 5h ${limits?.five_hour?.utilization ?? '?'}% (resets ${limits?.five_hour?.resets_at ?? '?'}) | week ${limits?.seven_day?.utilization ?? '?'}% (resets ${limits?.seven_day?.resets_at ?? '?'})`,
  );
  const models = await session.supportedModels();
  console.log('[models]');
  for (const model of models) {
    console.log(`  ${model.value} | ${model.displayName} | effort: ${model.supportedEffortLevels?.join(', ') ?? 'n/a'}`);
  }
}
