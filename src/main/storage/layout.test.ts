import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { chatFolders, storageCategories, storageLayout } from './layout';

describe('storage layout', () => {
  const layout = storageLayout(path.join('C:', 'data'));

  it('keeps every place inside the data folder', () => {
    const { root, ...places } = layout;
    for (const place of Object.values(places)) expect(path.relative(root, place).startsWith('..')).toBe(false);
  });

  it('measures every place in the map', () => {
    const measured = storageCategories(layout).flatMap((category) => category.paths);
    const { root: _root, ...places } = layout;
    for (const place of Object.values(places)) expect(measured).toContain(place);
  });
});

describe('chat folders', () => {
  const layout = storageLayout(path.join('C:', 'data'));

  it('puts attachments, previews and temporary files under one folder per chat', () => {
    const folders = chatFolders(layout, 'chat-1');
    expect(path.dirname(folders.attachments)).toBe(folders.root);
    expect(path.dirname(folders.previews)).toBe(folders.root);
    expect(path.dirname(folders.tmp)).toBe(folders.root);
    expect(path.dirname(folders.root)).toBe(layout.chatFiles);
  });

  it('refuses ids that could leave the chat folder', () => {
    expect(() => chatFolders(layout, '..\shadow')).toThrow();
  });
});
