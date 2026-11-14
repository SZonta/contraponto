// Spike: Claude delegates a subtask to Codex through an in-process MCP tool (the "Claude leads" mode).
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { CodexRpc, describeCodexItem } from './lib/codex-rpc.js';
import { stripHostAgentEnv } from './lib/env.js';

stripHostAgentEnv();
const workDir = path.resolve('output', 'delegate-work');
mkdirSync(workDir, { recursive: true });

const codex = new CodexRpc();
codex.serverRequestHandler = async (request) => {
  console.log(`  [codex approval] ${request.method}`);
  if (request.method === 'item/commandExecution/requestApproval' || request.method === 'item/fileChange/requestApproval') {
    return { decision: 'accept' };
  }
  throw new Error(`spike does not handle ${request.method}`);
};
await codex.initialize('contraponto-spike');
const { thread } = await codex.request('thread/start', {
  cwd: workDir,
  approvalPolicy: 'on-request',
  sandbox: 'workspace-write',
  ephemeral: true,
});

const delegateToCodex = tool(
  'delegate_to_codex',
  'Delegate a self-contained subtask to Codex (creative work: 3D models, images, textures, visual design). Returns the final answer from Codex and the files it changed.',
  {
    task: z.string().describe('Complete, self-contained brief for Codex'),
    expected_output: z.string().describe('What Codex must deliver'),
  },
  async ({ task, expected_output }) => {
    console.log(`\n[delegate_to_codex] ${task}`);
    const changedFiles: string[] = [];
    let finalAnswer = '';
    const off = codex.onNotification(({ method, params }) => {
      if (method !== 'item/completed') return;
      console.log(`  [codex] ${describeCodexItem(params.item)}`);
      if (params.item.type === 'fileChange') changedFiles.push(...params.item.changes.map((change: any) => change.path));
      if (params.item.type === 'agentMessage') finalAnswer = params.item.text;
    });
    const turnDone = codex.waitForTurnCompleted(thread.id);
    await codex.request('turn/start', {
      threadId: thread.id,
      input: [{ type: 'text', text: `${task}\n\nExpected output: ${expected_output}`, text_elements: [] }],
      effort: 'low',
    });
    const { turn } = await turnDone;
    off();
    const text = `Codex finished (${turn.status}).\nFinal answer: ${finalAnswer}\nChanged files: ${changedFiles.join(', ') || 'none reported'}`;
    return { content: [{ type: 'text', text }] };
  },
);

const session = query({
  prompt:
    'Use the delegate_to_codex tool to ask Codex to create a file named codex.txt containing the word hello in the current folder. When Codex finishes, read codex.txt yourself and confirm its content in one line.',
  options: {
    cwd: workDir,
    mcpServers: { contraponto: createSdkMcpServer({ name: 'contraponto', version: '0.0.0', tools: [delegateToCodex] }) },
    permissionMode: 'default',
    settingSources: ['user', 'project'],
    effort: 'low',
    maxTurns: 8,
    persistSession: false,
    canUseTool: async (toolName, input) => {
      console.log(`[claude approval] ${toolName}`);
      return { behavior: 'allow', updatedInput: input };
    },
  },
});

for await (const message of session) {
  if (message.type === 'assistant') {
    for (const block of message.message.content) {
      if (block.type === 'tool_use') console.log(`[claude tool] ${block.name}`);
      if (block.type === 'text') console.log(`[claude] ${block.text}`);
    }
  }
  if (message.type === 'result') {
    console.log(`\nresult: ${message.subtype} turns=${message.num_turns} cost_usd=${message.total_cost_usd} duration=${message.duration_ms} ms`);
  }
}
codex.close();
