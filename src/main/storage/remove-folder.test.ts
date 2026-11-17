import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { removeFolder } from './remove-folder';

describe('removeFolder', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'cp-remove-'));
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('removes links inside the folder but never what they point to', async () => {
    const target = path.join(root, 'project', 'node_modules');
    const chat = path.join(root, 'chat');
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, 'keep.txt'), 'x');
    mkdirSync(path.join(chat, 'nested'), { recursive: true });
    writeFileSync(path.join(chat, 'nested', 'file.txt'), 'x');
    symlinkSync(target, path.join(chat, 'node_modules'), 'junction');

    await removeFolder(chat);

    expect(existsSync(chat)).toBe(false);
    expect(existsSync(path.join(target, 'keep.txt'))).toBe(true);
  });

  it('does nothing for a missing folder', async () => {
    await expect(removeFolder(path.join(root, 'missing'))).resolves.toBeUndefined();
  });
});
