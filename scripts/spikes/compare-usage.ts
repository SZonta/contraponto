// Spike: the same tiny prompt through the Agent SDK and through `claude -p`, comparing tokens and cost.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { stripHostAgentEnv } from './lib/env.js';

stripHostAgentEnv();
const PROMPT = 'Reply with the single word ok.';
const CLAUDE_EXE = path.join(
  process.env.LOCALAPPDATA ?? '',
  'Microsoft',
  'WinGet',
  'Packages',
  'Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe',
  'claude.exe',
);
const workDir = path.resolve('output', 'compare-work');
mkdirSync(workDir, { recursive: true });

type RunSummary = { label: string; version?: string; model?: string; costUsd?: number; durationMs?: number; usage?: object; windows?: object };

// Both paths emit the same stream-json messages, so one collector serves both.
function collect(summary: RunSummary, message: any): void {
  if (message.type === 'system' && message.subtype === 'init') {
    summary.version = message.claude_code_version;
    summary.model = message.model;
  }
  if (message.type === 'rate_limit_event') summary.windows = message.rate_limit_info?.unifiedWindows;
  if (message.type === 'result') {
    summary.costUsd = message.total_cost_usd;
    summary.durationMs = message.duration_ms;
    summary.usage = {
      input: message.usage?.input_tokens,
      cacheWrite: message.usage?.cache_creation_input_tokens,
      cacheRead: message.usage?.cache_read_input_tokens,
      output: message.usage?.output_tokens,
    };
  }
}

async function viaSdk(): Promise<RunSummary> {
  const summary: RunSummary = { label: 'Agent SDK' };
  const session = query({ prompt: PROMPT, options: { cwd: workDir, settingSources: ['user', 'project'], persistSession: false } });
  for await (const message of session) collect(summary, message);
  return summary;
}

function viaCli(): Promise<RunSummary> {
  const summary: RunSummary = { label: 'claude -p' };
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_EXE, ['-p', PROMPT, '--output-format', 'stream-json', '--verbose', '--no-session-persistence'], {
      cwd: workDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    createInterface({ input: child.stdout }).on('line', (line) => {
      try {
        collect(summary, JSON.parse(line));
      } catch {
        // Ignore non-JSON lines.
      }
    });
    child.stderr.on('data', (chunk) => process.stderr.write(`[claude -p] ${chunk}`));
    child.on('error', reject);
    child.on('close', () => resolve(summary));
  });
}

for (const run of [await viaSdk(), await viaCli()]) console.log(JSON.stringify(run, null, 2));
