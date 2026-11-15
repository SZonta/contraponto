import { describe, expect, it } from 'vitest';
import { isHostAgentVariable } from './env';

describe('host environment isolation', () => {
  it('removes desktop-specific launch identities and auth proxies', () => {
    for (const name of ['CLAUDE_CODE_SIMPLE', 'ANTHROPIC_BASE_URL', 'CODEX_WINDOWS_REGISTERED_CORE', 'CODEX_APP_TOOLS_PIPE_PATH',
      'CODEX_APP_RUNTIME_CLI_PATH', 'CODEX_WINDOWS_SANDBOX_PACKAGE_FAMILY', 'CODEX_PERMISSION_PROFILE', 'CODEX_SHELL', 'CODEX_THREAD_ID']) {
      expect(isHostAgentVariable(name), name).toBe(true);
    }
  });
  it('preserves CLI configuration, certificate paths and the configured network restriction', () => {
    for (const name of ['PATH', 'APPDATA', 'CODEX_HOME', 'CODEX_CA_CERTIFICATE', 'CODEX_SANDBOX_NETWORK_DISABLED']) {
      expect(isHostAgentVariable(name), name).toBe(false);
    }
  });
});
