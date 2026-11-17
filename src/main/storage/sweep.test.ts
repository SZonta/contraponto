import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chatFolders, checkpointRepo, storageLayout } from './layout';
import { Store } from './store';
import { removeChatData, sweepOrphans } from './sweep';

describe('storage sweep', () => {
  let root: string;
  let store: Store;
  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'cp-sweep-')); store = new Store(':memory:'); });
  afterEach(() => { store.close(); rmSync(root, { recursive: true, force: true }); });

  it('removes per-chat files and checkpoints nobody owns, keeping the rest', async () => {
    const layout = storageLayout(root);
    const project = store.addProject(path.join(root, 'game'));
    const chat = store.createChat(project.id);
    const kept = [chatFolders(layout, chat.id).previews, checkpointRepo(layout, project.id)];
    const orphans = [chatFolders(layout, 'gone-chat').tmp, checkpointRepo(layout, 'gone-project'), path.join(layout.chats, 'old-scratch')];
    for (const folder of [...kept, ...orphans]) mkdirSync(folder, { recursive: true });

    await sweepOrphans(layout, store);

    for (const folder of kept) expect(existsSync(folder)).toBe(true);
    expect(existsSync(chatFolders(layout, 'gone-chat').root)).toBe(false);
    expect(existsSync(checkpointRepo(layout, 'gone-project'))).toBe(false);
    expect(existsSync(path.join(layout.chats, 'old-scratch'))).toBe(false);
  });

  it('deleting a scratch chat takes its files and its checkpoints along', async () => {
    const layout = storageLayout(root);
    const scratch = store.addProject(path.join(layout.chats, 'abc'), true);
    const chat = store.createChat(scratch.id);
    mkdirSync(chatFolders(layout, chat.id).attachments, { recursive: true });
    mkdirSync(checkpointRepo(layout, scratch.id), { recursive: true });

    store.deleteChat(chat.id);
    await removeChatData(layout, store, chat.id, scratch.id);

    expect(existsSync(chatFolders(layout, chat.id).root)).toBe(false);
    expect(existsSync(checkpointRepo(layout, scratch.id))).toBe(false);
  });

  it('keeps the checkpoints of a folder project when one of its chats is deleted', async () => {
    const layout = storageLayout(root);
    const project = store.addProject(path.join(root, 'game'));
    const chat = store.createChat(project.id);
    mkdirSync(checkpointRepo(layout, project.id), { recursive: true });

    store.deleteChat(chat.id);
    await removeChatData(layout, store, chat.id, project.id);

    expect(existsSync(checkpointRepo(layout, project.id))).toBe(true);
  });
});
