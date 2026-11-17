import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from './store';

describe('Store', () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(':memory:');
  });

  afterEach(() => store.close());

  it('adds a project once per folder, ignoring case', () => {
    const first = store.addProject('C:\\Projetos\\Jogo');
    const again = store.addProject('c:\\projetos\\jogo');
    expect(again.id).toBe(first.id);
    expect(first.name).toBe('Jogo');
    expect(store.listProjects()).toHaveLength(1);
  });

  it('lists every chat, most recent first, when no project is given', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const first = store.createChat(store.addProject('C:\\Projetos\\Jogo').id);
    now.mockReturnValue(2000);
    const second = store.createChat(store.addProject('C:\\Projetos\\Site').id);
    now.mockReturnValue(3000);
    store.addEntry(first.id, { kind: 'notice', text: 'later' });
    now.mockRestore();
    expect(store.listChats().map((chat) => chat.id)).toEqual([first.id, second.id]);
  });

  it('moves a chat without messages from its scratch folder into a chosen folder', () => {
    const scratch = store.addProject('C:\\Data\\chats\\a', true);
    expect(scratch.scratch).toBe(true);
    const chat = store.createChat(scratch.id);
    const moved = store.moveChat(chat.id, 'C:\\Projetos\\Jogo');
    expect(store.getProject(moved.projectId)).toMatchObject({ path: 'C:\\Projetos\\Jogo', scratch: false });
    expect(store.getProject(scratch.id)).toBeUndefined();
  });

  it('refuses to move a chat that already has messages', () => {
    const chat = store.createChat(store.addProject('C:\\Data\\chats\\a', true).id);
    store.addEntry(chat.id, { kind: 'user', text: 'oi', attachments: [] });
    expect(() => store.moveChat(chat.id, 'C:\\Projetos\\Jogo')).toThrow('antes da primeira mensagem');
  });

  it('drops the scratch project with its chat but keeps real folders', () => {
    const scratch = store.addProject('C:\\Data\\chats\\a', true);
    const folder = store.addProject('C:\\Projetos\\Jogo');
    store.deleteChat(store.createChat(scratch.id).id);
    store.deleteChat(store.createChat(folder.id).id);
    expect(store.listProjects().map((project) => project.id)).toEqual([folder.id]);
  });

  it('removes the scratch folder from disk when its chat is deleted or moved', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'cp-chats-'));
    try {
      const deleted = path.join(root, 'a');
      const moved = path.join(root, 'b');
      mkdirSync(deleted);
      writeFileSync(path.join(deleted, 'file.txt'), 'x');
      mkdirSync(moved);
      // Like a closing agent process: it holds the folder as its working directory for a moment.
      const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { cwd: deleted });
      setTimeout(() => holder.kill(), 300);
      store.deleteChat(store.createChat(store.addProject(deleted, true).id).id);
      store.moveChat(store.createChat(store.addProject(moved, true).id).id, 'C:\\Projetos\\Jogo');
      await vi.waitFor(() => {
        expect(existsSync(deleted)).toBe(false);
        expect(existsSync(moved)).toBe(false);
      }, { timeout: 5000 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('discards a chat only while nothing was sent in it', () => {
    const project = store.addProject('C:\\Projetos\\Jogo');
    const empty = store.createChat(project.id);
    const used = store.createChat(project.id);
    store.addEntry(used.id, { kind: 'user', text: 'oi', attachments: [] });
    expect(store.deleteChatIfEmpty(empty.id)).toBe(true);
    expect(store.deleteChatIfEmpty(used.id)).toBe(false);
    expect(store.deleteChatIfEmpty('missing')).toBe(false);
    expect(store.listChats().map((chat) => chat.id)).toEqual([used.id]);
  });

  it('creates, updates and deletes chats with their entries', () => {
    const project = store.addProject('C:\\Projetos\\Jogo');
    const chat = store.createChat(project.id, { agent: 'codex' });
    expect(chat).toMatchObject({ title: 'Novo chat', agent: 'codex', permissionLevel: 'ask', claudeSessionId: null });

    const updated = store.updateChat(chat.id, { title: 'Texturas', claudeSessionId: 'session-1', codexEffort: 'low' });
    expect(updated).toMatchObject({ title: 'Texturas', claudeSessionId: 'session-1', codexEffort: 'low' });

    store.addEntry(chat.id, { kind: 'user', text: 'oi', attachments: [] });
    expect(store.listEntries(chat.id)).toHaveLength(1);

    store.deleteChat(chat.id);
    expect(store.getChat(chat.id)).toBeUndefined();
    expect(store.listEntries(chat.id)).toHaveLength(0);
  });

  it('keeps entries in insertion order and updates them in place', () => {
    const project = store.addProject('C:\\Projetos\\Jogo');
    const chat = store.createChat(project.id);
    store.addEntry(chat.id, { kind: 'user', text: 'primeira', attachments: [] });
    const tool = store.addEntry(chat.id, {
      kind: 'tool',
      agent: 'claude',
      toolId: 't1',
      name: 'Bash',
      detail: 'ls',
      status: 'running',
    });
    if (tool.kind !== 'tool') throw new Error('expected a tool entry');
    store.updateEntry({ ...tool, status: 'done', output: 'a.txt' });

    const entries = store.listEntries(chat.id);
    expect(entries.map((entry) => entry.kind)).toEqual(['user', 'tool']);
    expect(entries[1]).toMatchObject({ id: tool.id, status: 'done', output: 'a.txt' });
  });

  it('stores settings as JSON', () => {
    store.setSetting('usage', { claude: 71 });
    store.setSetting('usage', { claude: 72 });
    expect(store.getSetting('usage')).toEqual({ claude: 72 });
    expect(store.getSetting('missing')).toBeUndefined();
  });
});

describe('chat title storage limit', () => {
  it('refuses an oversized title when creating a chat', () => {
    const store = new Store(':memory:');
    const project = store.addProject('C:\\Projects\\Example');
    expect(() => store.createChat(project.id, { title: 'a'.repeat(61) })).toThrow('60 caracteres');
    expect(store.listChats(project.id)).toHaveLength(0);
    store.close();
  });
  it('refuses an oversized rename without changing the current title', () => {
    const store = new Store(':memory:');
    const project = store.addProject('C:\\Projects\\Example');
    const chat = store.createChat(project.id, { title: 'Nome válido' });
    expect(() => store.updateChat(chat.id, { title: 'a'.repeat(61) })).toThrow('60 caracteres');
    expect(store.getChat(chat.id)?.title).toBe('Nome válido');
    store.close();
  });
  it('stores a complete 60-character title and still permits session updates', () => {
    const store = new Store(':memory:');
    const project = store.addProject('C:\\Projects\\Example');
    const title = 'a'.repeat(60);
    const chat = store.createChat(project.id, { title });
    store.updateChat(chat.id, { claudeSessionId: 'session' });
    expect(store.getChat(chat.id)).toMatchObject({ title, claudeSessionId: 'session' });
    store.close();
  });
});
