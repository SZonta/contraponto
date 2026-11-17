import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { AttachmentStore } from './attachments';

describe('AttachmentStore', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'cp-attach-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const store = new AttachmentStore((chatId) => path.join(root, chatId, 'attachments'));

  it('keeps copied and pasted files in the folder of their chat', () => {
    const source = path.join(root, 'shot.png');
    writeFileSync(source, 'x');
    const copied = store.copy('chat-a', source);
    const pasted = store.save('chat-b', 'image.png', 'image/png', new Uint8Array([1]));
    expect(path.dirname(copied.path)).toBe(path.join(root, 'chat-a', 'attachments'));
    expect(path.dirname(pasted.path)).toBe(path.join(root, 'chat-b', 'attachments'));
    expect(existsSync(copied.path) && existsSync(pasted.path)).toBe(true);
  });
});
