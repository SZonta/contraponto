import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { CHAT_TITLE_LIMIT } from '@shared/chat-title';
import type { Chat, ChatEntry, ChatSettings, Project, Schedule, StoredEntry } from '@shared/types';

/** Each entry runs once, in order; PRAGMA user_version records how many ran. */
const MIGRATIONS: string[] = [
  `CREATE TABLE projects (
     id TEXT PRIMARY KEY,
     path TEXT NOT NULL UNIQUE,
     name TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE chats (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     title TEXT NOT NULL,
     agent TEXT NOT NULL,
     claude_session_id TEXT,
     codex_thread_id TEXT,
     claude_model TEXT,
     claude_effort TEXT,
     codex_model TEXT,
     codex_effort TEXT,
     permission_level TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE entries (
     seq INTEGER PRIMARY KEY AUTOINCREMENT,
     id TEXT NOT NULL UNIQUE,
     chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
     payload TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX entries_by_chat ON entries(chat_id, seq);
   CREATE TABLE settings (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );`,
  `CREATE TABLE timeline (
     seq INTEGER PRIMARY KEY AUTOINCREMENT,
     id TEXT NOT NULL UNIQUE,
     project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     chat_id TEXT,
     agent TEXT NOT NULL,
     prompt TEXT NOT NULL,
     result TEXT NOT NULL,
     files TEXT NOT NULL,
     before_ref TEXT NOT NULL,
     after_ref TEXT NOT NULL,
     undone INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX timeline_by_project ON timeline(project_id, seq);`,
  `CREATE TABLE schedules (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     payload TEXT NOT NULL
   );`,
  // Scratch projects are the private folders of chats started without a folder.
  `ALTER TABLE projects ADD COLUMN scratch INTEGER NOT NULL DEFAULT 0;`,
];

/** One agent turn in a project: what was asked, what came back, which files changed. */
export type TimelineEntry = {
  id: string;
  projectId: string;
  chatId: string | null;
  agent: string;
  prompt: string;
  result: string;
  files: string[];
  beforeRef: string;
  afterRef: string;
  undone: boolean;
  createdAt: number;
};

function toTimeline(row: any): TimelineEntry {
  return {
    id: row.id,
    projectId: row.project_id,
    chatId: row.chat_id,
    agent: row.agent,
    prompt: row.prompt,
    result: row.result,
    files: JSON.parse(row.files),
    beforeRef: row.before_ref,
    afterRef: row.after_ref,
    undone: Boolean(row.undone),
    createdAt: row.created_at,
  };
}

type ChatRow = {
  id: string;
  project_id: string;
  title: string;
  agent: string;
  claude_session_id: string | null;
  codex_thread_id: string | null;
  claude_model: string | null;
  claude_effort: string | null;
  codex_model: string | null;
  codex_effort: string | null;
  permission_level: string;
  created_at: number;
  updated_at: number;
};

const CHAT_COLUMNS: Record<keyof ChatSettings | 'claudeSessionId' | 'codexThreadId', string> = {
  title: 'title',
  agent: 'agent',
  claudeModel: 'claude_model',
  claudeEffort: 'claude_effort',
  codexModel: 'codex_model',
  codexEffort: 'codex_effort',
  permissionLevel: 'permission_level',
  claudeSessionId: 'claude_session_id',
  codexThreadId: 'codex_thread_id',
};

function toChat(row: ChatRow): Chat {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    agent: row.agent as Chat['agent'],
    claudeSessionId: row.claude_session_id,
    codexThreadId: row.codex_thread_id,
    claudeModel: row.claude_model,
    claudeEffort: row.claude_effort,
    codexModel: row.codex_model,
    codexEffort: row.codex_effort,
    permissionLevel: row.permission_level as Chat['permissionLevel'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class Store {
  private readonly db: DatabaseSync;

  /** Pass ':memory:' in tests. */
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  listProjects(): Project[] {
    const rows = this.db.prepare('SELECT * FROM projects ORDER BY name COLLATE NOCASE').all() as any[];
    return rows.map((row) => ({ id: row.id, path: row.path, name: row.name, scratch: Boolean(row.scratch), createdAt: row.created_at }));
  }

  getProject(id: string): Project | undefined {
    return this.listProjects().find((project) => project.id === id);
  }

  /** Returns the existing project when the folder was already added. */
  addProject(folder: string, scratch = false): Project {
    const existing = this.listProjects().find((project) => project.path.toLowerCase() === folder.toLowerCase());
    if (existing) return existing;
    const project: Project = { id: randomUUID(), path: folder, name: path.basename(folder), scratch, createdAt: Date.now() };
    this.db
      .prepare('INSERT INTO projects (id, path, name, scratch, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(project.id, project.path, project.name, scratch ? 1 : 0, project.createdAt);
    return project;
  }

  /** Most recent first; every chat when no project is given. */
  listChats(projectId?: string): Chat[] {
    const rows = projectId
      ? this.db.prepare('SELECT * FROM chats WHERE project_id = ? ORDER BY updated_at DESC').all(projectId)
      : this.db.prepare('SELECT * FROM chats ORDER BY updated_at DESC').all();
    return (rows as ChatRow[]).map(toChat);
  }

  /** Moves a chat that has no messages yet into a folder; its scratch project record goes away. */
  moveChat(chatId: string, folder: string): Chat {
    const chat = this.getChat(chatId);
    if (!chat) throw new Error('Chat não encontrado.');
    if (this.listEntries(chatId).length) throw new Error('A pasta só pode ser escolhida antes da primeira mensagem.');
    const project = this.addProject(folder);
    this.db.prepare('UPDATE chats SET project_id = ? WHERE id = ?').run(project.id, chatId);
    this.dropScratch(chat.projectId);
    return this.getChat(chatId)!;
  }

  getChat(id: string): Chat | undefined {
    const row = this.db.prepare('SELECT * FROM chats WHERE id = ?').get(id) as ChatRow | undefined;
    return row && toChat(row);
  }

  createChat(projectId: string, defaults: ChatSettings = {}): Chat {
    if (Array.from(defaults.title ?? '').length > CHAT_TITLE_LIMIT) throw new Error('O título do chat deve ter no máximo 60 caracteres.');
    const now = Date.now();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO chats (id, project_id, title, agent, claude_model, claude_effort, codex_model, codex_effort,
                            permission_level, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        projectId,
        defaults.title ?? 'Novo chat',
        defaults.agent ?? 'claude',
        defaults.claudeModel ?? null,
        defaults.claudeEffort ?? null,
        defaults.codexModel ?? null,
        defaults.codexEffort ?? null,
        defaults.permissionLevel ?? 'ask',
        now,
        now,
      );
    return this.getChat(id)!;
  }

  updateChat(id: string, patch: ChatSettings & Partial<Pick<Chat, 'claudeSessionId' | 'codexThreadId'>>): Chat {
    if (patch.title !== undefined && Array.from(patch.title).length > CHAT_TITLE_LIMIT) throw new Error('O título do chat deve ter no máximo 60 caracteres.');
    const keys = Object.keys(patch) as (keyof typeof CHAT_COLUMNS)[];
    if (keys.length > 0) {
      const assignments = keys.map((key) => `${CHAT_COLUMNS[key]} = ?`).join(', ');
      const values = keys.map((key) => (patch[key] ?? null) as string | null);
      this.db.prepare(`UPDATE chats SET ${assignments}, updated_at = ? WHERE id = ?`).run(...values, Date.now(), id);
    }
    return this.getChat(id)!;
  }

  deleteChat(id: string): void {
    const chat = this.getChat(id);
    this.db.prepare('DELETE FROM chats WHERE id = ?').run(id);
    if (chat) this.dropScratch(chat.projectId);
  }

  /** A scratch project serves one chat; once it has none, its record goes too. The folder stays on disk. */
  private dropScratch(projectId: string): void {
    if (this.getProject(projectId)?.scratch && !this.listChats(projectId).length) {
      this.db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    }
  }

  listEntries(chatId: string): StoredEntry[] {
    const rows = this.db.prepare('SELECT * FROM entries WHERE chat_id = ? ORDER BY seq').all(chatId) as any[];
    return rows.map((row) => ({ ...JSON.parse(row.payload), id: row.id, chatId: row.chat_id, createdAt: row.created_at }));
  }

  addEntry(chatId: string, entry: ChatEntry): StoredEntry {
    const stored: StoredEntry = { ...entry, id: randomUUID(), chatId, createdAt: Date.now() };
    this.db
      .prepare('INSERT INTO entries (id, chat_id, payload, created_at) VALUES (?, ?, ?, ?)')
      .run(stored.id, chatId, JSON.stringify(entry), stored.createdAt);
    this.db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(stored.createdAt, chatId);
    return stored;
  }

  updateEntry(stored: StoredEntry): void {
    const { id, chatId: _chatId, createdAt: _createdAt, ...entry } = stored;
    this.db.prepare('UPDATE entries SET payload = ? WHERE id = ?').run(JSON.stringify(entry), id);
  }

  getEntry(id: string): StoredEntry | undefined {
    const row = this.db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as any;
    return row && { ...JSON.parse(row.payload), id: row.id, chatId: row.chat_id, createdAt: row.created_at };
  }

  addTimeline(entry: Omit<TimelineEntry, 'id' | 'undone' | 'createdAt'>): TimelineEntry {
    const stored: TimelineEntry = { ...entry, id: randomUUID(), undone: false, createdAt: Date.now() };
    this.db
      .prepare(
        `INSERT INTO timeline (id, project_id, chat_id, agent, prompt, result, files, before_ref, after_ref, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        stored.id,
        stored.projectId,
        stored.chatId,
        stored.agent,
        stored.prompt,
        stored.result,
        JSON.stringify(stored.files),
        stored.beforeRef,
        stored.afterRef,
        stored.createdAt,
      );
    return stored;
  }

  /** Oldest first. */
  listTimeline(projectId: string): TimelineEntry[] {
    return (this.db.prepare('SELECT * FROM timeline WHERE project_id = ? ORDER BY seq').all(projectId) as any[]).map(toTimeline);
  }

  getTimeline(id: string): TimelineEntry | undefined {
    const row = this.db.prepare('SELECT * FROM timeline WHERE id = ?').get(id);
    return row ? toTimeline(row) : undefined;
  }

  markTimelineUndone(id: string): void {
    this.db.prepare('UPDATE timeline SET undone = 1 WHERE id = ?').run(id);
  }

  getSetting<T>(key: string): T | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as T) : undefined;
  }

  listSchedules(): Schedule[] {
    return (this.db.prepare('SELECT payload FROM schedules ORDER BY rowid').all() as { payload: string }[])
      .map((row) => JSON.parse(row.payload) as Schedule);
  }

  saveSchedule(schedule: Schedule): void {
    this.db.prepare(`INSERT INTO schedules (id, project_id, payload) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, payload = excluded.payload`)
      .run(schedule.id, schedule.projectId, JSON.stringify(schedule));
  }

  deleteSchedule(id: string): void {
    this.db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
  }

  setSetting(key: string, value: unknown): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value));
  }

  private migrate(): void {
    const { user_version: current } = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
    for (let version = current; version < MIGRATIONS.length; version++) {
      this.db.exec('BEGIN');
      try {
        this.db.exec(MIGRATIONS[version]);
        this.db.exec(`PRAGMA user_version = ${version + 1}`);
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }
  }
}
