import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
