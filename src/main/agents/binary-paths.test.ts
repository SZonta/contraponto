import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findClaudeBinary, unpackedPath } from './binary-paths';

describe('packaged native binary paths', () => {
  it('maps ASAR executables to physical paths without touching unrelated names', () => {
    expect(unpackedPath('C:\\App\\resources\\app.asar\\node_modules\\cli.exe')).toBe('C:\\App\\resources\\app.asar.unpacked\\node_modules\\cli.exe');
    expect(unpackedPath('/App/resources/app.asar/native/cli')).toBe('/App/resources/app.asar.unpacked/native/cli');
    expect(unpackedPath('C:\\app.asar-copy\\cli.exe')).toBe('C:\\app.asar-copy\\cli.exe');
  });
  it('resolves the native CLI of the installed SDK dependency', () => {
    expect(findClaudeBinary()).toContain('claude-agent-sdk-win32-x64');
    expect(existsSync(findClaudeBinary())).toBe(true);
  });
});
