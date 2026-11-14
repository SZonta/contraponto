// Spike: native image generation in Codex through app-server — where the file lands and what it costs.
import { mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { CodexRpc, describeCodexItem, formatCodexLimits } from './lib/codex-rpc.js';

const PROMPT =
  'Generate a 512x512 seamless, tileable dark wood plank texture for a horror game, top-down view, no text. Save it in the current folder as wood.png.';
const workDir = path.resolve('output', 'codex-image');
mkdirSync(workDir, { recursive: true });

const rpc = new CodexRpc();
rpc.serverRequestHandler = async (request) => {
  console.log(`\n[approval] ${request.method}: ${JSON.stringify(request.params).slice(0, 200)}`);
  if (request.method === 'item/commandExecution/requestApproval' || request.method === 'item/fileChange/requestApproval') {
    return { decision: 'accept' };
  }
  throw new Error(`spike does not handle ${request.method}`);
};
rpc.onNotification(({ method, params }) => {
  if (method === 'item/agentMessage/delta') process.stdout.write(params.delta);
  if (method === 'item/started' && params.item.type === 'imageGeneration') console.log('\n[imageGeneration started]');
  if (method === 'item/completed') {
    console.log(`\n[item] ${describeCodexItem(params.item)}`);
    if (params.item.type === 'imageGeneration') {
      const { status, savedPath, revisedPrompt, failure } = params.item;
      console.log(`  status=${status}\n  savedPath=${savedPath}\n  revisedPrompt=${revisedPrompt}\n  failure=${JSON.stringify(failure)}`);
    }
  }
});

await rpc.initialize('contraponto-spike');
const before = await rpc.request('account/rateLimits/read');
console.log(`limits before: ${formatCodexLimits(before.rateLimits)}`);

const startedAt = Date.now();
const { thread } = await rpc.request('thread/start', {
  cwd: workDir,
  approvalPolicy: 'on-request',
  sandbox: 'workspace-write',
  ephemeral: true,
});
const turnDone = rpc.waitForTurnCompleted(thread.id);
await rpc.request('turn/start', {
  threadId: thread.id,
  input: [{ type: 'text', text: PROMPT, text_elements: [] }],
  effort: 'low',
});
const { turn } = await turnDone;
console.log(`\n\nturn ${turn.status} in ${Date.now() - startedAt} ms`);

const after = await rpc.request('account/rateLimits/read');
console.log(`limits after: ${formatCodexLimits(after.rateLimits)}`);
console.log(`files in work dir: ${readdirSync(workDir).join(', ') || '(none)'}`);
rpc.close();
