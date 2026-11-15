import { describe, expect, it } from 'vitest';
import { findCodexBinary } from './codex-rpc';

describe('findCodexBinary', () => {
  it('uses the codex.exe of the pinned project dependency first', () => {
    const binary = findCodexBinary();
    expect(binary.startsWith(process.cwd())).toBe(true);
    expect(binary.endsWith('codex.exe')).toBe(true);
  });
});
