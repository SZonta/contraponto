import { createRequire } from 'node:module';
import path from 'node:path';

/** Native processes must run from real files, never Electron's virtual ASAR. */
export function unpackedPath(file: string): string {
  return file.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');
}

export function findClaudeBinary(): string {
  const require = createRequire(import.meta.url);
  const packageFile = require.resolve('@anthropic-ai/claude-agent-sdk-win32-x64/package.json');
  return unpackedPath(path.join(path.dirname(packageFile), 'claude.exe'));
}
