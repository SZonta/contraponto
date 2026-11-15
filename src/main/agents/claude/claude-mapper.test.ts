import { describe, expect, it } from 'vitest';
import { ClaudeEventMapper } from './claude-mapper';

describe('ClaudeEventMapper', () => {
  it('reports the session id from the init message', () => {
    const mapper = new ClaudeEventMapper();
    expect(mapper.map({ type: 'system', subtype: 'init', session_id: 'abc' })).toEqual([{ type: 'session', sessionId: 'abc' }]);
  });

  it('reports background tasks as a full list, leaving out ambient ones', () => {
    const mapper = new ClaudeEventMapper();
    const tasks = [{ task_id: 'a', task_type: 'local_bash', description: 'Render video' }, { task_id: 'b', task_type: 'monitor', description: 'Watch', ambient: true }];
    expect(mapper.map({ type: 'system', subtype: 'background_tasks_changed', tasks })).toEqual([{ type: 'background', tasks: ['Render video'] }]);
    expect(mapper.map({ type: 'system', subtype: 'background_tasks_changed', tasks: [] })).toEqual([{ type: 'background', tasks: [] }]);
  });

  it('streams text deltas and ignores subagent messages', () => {
    const mapper = new ClaudeEventMapper();
    const delta = { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Oi' } } };
    expect(mapper.map(delta)).toEqual([{ type: 'textDelta', text: 'Oi' }]);
    expect(mapper.map({ ...delta, parent_tool_use_id: 'task-1' })).toEqual([]);
  });

  it('turns a successful Write into a tool card and a file change', () => {
    const mapper = new ClaudeEventMapper();
    const started = mapper.map({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Vou criar o arquivo.' },
          { type: 'tool_use', id: 't1', name: 'Write', input: { file_path: 'C:\\p\\a.txt', content: 'ok' } },
        ],
      },
    });
    expect(started).toEqual([
      { type: 'message', text: 'Vou criar o arquivo.' },
      { type: 'toolStarted', toolId: 't1', name: 'Write', detail: 'C:\\p\\a.txt' },
    ]);

    const completed = mapper.map({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'File created' }] },
    });
    expect(completed).toEqual([
      { type: 'toolCompleted', toolId: 't1', status: 'done', output: 'File created' },
      { type: 'fileChange', paths: ['C:\\p\\a.txt'] },
    ]);
  });

  it('does not report a file change when the tool failed', () => {
    const mapper = new ClaudeEventMapper();
    mapper.map({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't2', name: 'Edit', input: { file_path: 'b.ts' } }] } });
    const events = mapper.map({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 't2', is_error: true, content: [{ type: 'text', text: 'denied' }] }] },
    });
    expect(events).toEqual([{ type: 'toolCompleted', toolId: 't2', status: 'failed', output: 'denied' }]);
  });

  it('reads plan usage from unifiedWindows', () => {
    const mapper = new ClaudeEventMapper();
    const [event] = mapper.map({
      type: 'rate_limit_event',
      rate_limit_info: {
        status: 'allowed',
        unifiedWindows: { five_hour: { utilization: 0.71, resetsAt: 1794709800 }, seven_day: { utilization: 0.14, resetsAt: 1794970800 } },
      },
    });
    expect(event).toMatchObject({
      type: 'usage',
      usage: { fiveHour: { usedPercent: 71, resetsAt: 1794709800000 }, week: { usedPercent: 14, resetsAt: 1794970800000 } },
    });
  });

  it('reports errors from a failed result', () => {
    const mapper = new ClaudeEventMapper();
    expect(mapper.map({ type: 'result', subtype: 'error_max_turns' })).toEqual([
      { type: 'error', message: 'Claude terminou com error_max_turns' },
      { type: 'turnCompleted', status: 'error_max_turns' },
    ]);
  });
});
