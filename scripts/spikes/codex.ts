// Spike: Codex through `codex app-server` — models, rate limits, streaming and approvals.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { CodexRpc, describeCodexItem, formatCodexLimits } from './lib/codex-rpc.js';

const PROMPT =
  'Create a file named note.txt containing the word ok, then list the files in the current folder. Answer in one short line.';
const workDir = path.resolve('output', 'codex-work');
mkdirSync(workDir, { recursive: true });

const rpc = new CodexRpc();
let lastTokenUsage: unknown;

rpc.serverRequestHandler = async (request) => {
  console.log(`\n[approval] ${request.method}: ${JSON.stringify(request.params).slice(0, 200)}`);
  if (request.method === 'item/commandExecution/requestApproval' || request.method === 'item/fileChange/requestApproval') {
    return { decision: 'accept' };
  }
  throw new Error(`spike does not handle ${request.method}`);
};

rpc.onNotification(({ method, params }) => {
  switch (method) {
    case 'item/agentMessage/delta':
      process.stdout.write(params.delta);
      break;
    case 'item/completed':
      console.log(`\n[item] ${describeCodexItem(params.item)}`);
      break;
    case 'thread/tokenUsage/updated':
      lastTokenUsage = params.tokenUsage;
      break;
    case 'account/rateLimits/updated':
      console.log(`\n[rateLimits/updated] ${formatCodexLimits(params.rateLimits)}`);
      break;
    case 'error':
      console.log(`\n[error] ${JSON.stringify(params)}`);
      break;
  }
});

const startedAt = Date.now();
await rpc.initialize('contraponto-spike');
console.log(`initialized in ${Date.now() - startedAt} ms`);

const account = await rpc.request('account/read', { refreshToken: false });
console.log(`account: type=${account.account?.type ?? 'none'} plan=${account.account?.planType ?? '?'}`);

const models = await rpc.request('model/list', {});
console.log('\nmodels:');
for (const model of models.data) {
  if (model.hidden) continue;
  const efforts = model.supportedReasoningEfforts.map((option: any) => option.reasoningEffort).join(', ');
  console.log(`${model.isDefault ? '*' : ' '} ${model.id} | ${model.displayName} | efforts: ${efforts} | default: ${model.defaultReasoningEffort}`);
}

const before = await rpc.request('account/rateLimits/read');
console.log(`\nlimits before: ${formatCodexLimits(before.rateLimits)}`);

const threadStartedAt = Date.now();
const started = await rpc.request('thread/start', {
  cwd: workDir,
  approvalPolicy: 'untrusted',
  sandbox: 'workspace-write',
  ephemeral: true,
});
console.log(`thread ${started.thread.id} model=${started.model} effort=${started.reasoningEffort} (${Date.now() - threadStartedAt} ms)`);
console.log(`instruction sources: ${JSON.stringify(started.instructionSources)}`);

const turnDone = rpc.waitForTurnCompleted(started.thread.id);
await rpc.request('turn/start', {
  threadId: started.thread.id,
  input: [{ type: 'text', text: PROMPT, text_elements: [] }],
  effort: 'low',
});
const { turn } = await turnDone;
console.log(`\n\nturn ${turn.status} in ${Date.now() - threadStartedAt} ms`);
console.log(`token usage: ${JSON.stringify(lastTokenUsage)}`);

const after = await rpc.request('account/rateLimits/read');
console.log(`limits after: ${formatCodexLimits(after.rateLimits)}`);
rpc.close();
