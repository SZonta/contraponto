import { describe, expect, it } from 'vitest';
import { claudeSubagentEnv } from './subagent-env';

describe('claudeSubagentEnv', () => {
  it('forces the chosen model and effort on every subagent', () => {
    expect(claudeSubagentEnv('opus', 'high')).toEqual({
      CLAUDE_CODE_SUBAGENT_MODEL: 'opus',
      CLAUDE_CODE_SUBAGENT_MODEL_FORCE: '1',
      CLAUDE_CODE_EFFORT_LEVEL: 'high',
    });
  });

  it('leaves Claude Code defaults alone when nothing was picked', () => {
    expect(claudeSubagentEnv(null, null)).toEqual({});
    expect(claudeSubagentEnv('default', null)).toEqual({});
  });

  it('forces only what was picked', () => {
    expect(claudeSubagentEnv(null, 'low')).toEqual({ CLAUDE_CODE_EFFORT_LEVEL: 'low' });
  });
});
