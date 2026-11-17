import path from 'node:path';
import type { StorageCategory } from './disk-usage';

/**
 * The only map of where the app writes. A feature that stores files adds its place here,
 * with an owner whose deletion removes it and a class that says how long it may stay:
 *
 * | place        | owner   | class      | stays until                                   |
 * |--------------|---------|------------|-----------------------------------------------|
 * | database     | app     | user data  | the user deletes chats/projects               |
 * | chats        | chat    | user data  | its chat is deleted                           |
 * | chatFiles    | chat    | user data  | its chat is deleted (attachments, previews,   |
 * |              |         |            | temporary work files)                         |
 * | attachments  | chat    | user data  | legacy flat folder, emptied once              |
 * | previews     | app     | derived    | legacy flat folder, emptied once              |
 * | shadow       | project | derived    | its project is deleted                        |
 * | crashLog     | app     | disposable | rotated                                       |
 * | Chromium     | app     | disposable | Chromium's own size limits                    |
 */
export type StorageLayout = {
  root: string;
  database: string;
  /** Private work folders of chats started without a folder. */
  chats: string;
  /** One folder per chat: attachments, previews and temporary work files. */
  chatFiles: string;
  attachments: string;
  previews: string;
  /** One checkpoint repository per project. */
  shadow: string;
  crashLog: string;
};

export function storageLayout(root: string): StorageLayout {
  const at = (name: string) => path.join(root, name);
  return {
    root,
    database: at('contraponto.db'),
    chats: at('chats'),
    chatFiles: at('chat-files'),
    attachments: at('attachments'),
    previews: at('previews'),
    shadow: at('shadow'),
    crashLog: at('renderer-crash.log'),
  };
}

export type ChatFolders = { root: string; attachments: string; previews: string; tmp: string };

/** Everything a chat stores lives under one folder, so deleting the chat removes it all. */
export function chatFolders(layout: StorageLayout, chatId: string): ChatFolders {
  if (!/^[\w-]+$/.test(chatId)) throw new Error('Chat inválido.');
  const root = path.join(layout.chatFiles, chatId);
  return { root, attachments: path.join(root, 'attachments'), previews: path.join(root, 'previews'), tmp: path.join(root, 'tmp') };
}

/** The checkpoint repository of one project. */
export function checkpointRepo(layout: StorageLayout, projectId: string): string {
  return path.join(layout.shadow, `${projectId}.git`);
}

const CHROMIUM_CACHES = ['Cache', 'Code Cache', 'GPUCache', 'GrShaderCache', 'ShaderCache', 'DawnGraphiteCache', 'DawnWebGPUCache'];

/** What the storage meter adds up, one entry per place in the map. */
export function storageCategories(layout: StorageLayout): StorageCategory[] {
  return [
    { id: 'database', paths: ['', '-wal', '-shm'].map((suffix) => layout.database + suffix) },
    { id: 'chats', paths: [layout.chats] },
    { id: 'chatFiles', paths: [layout.chatFiles] },
    { id: 'attachments', paths: [layout.attachments] },
    { id: 'previews', paths: [layout.previews] },
    { id: 'checkpoints', paths: [layout.shadow] },
    { id: 'logs', paths: [layout.crashLog] },
    { id: 'caches', paths: CHROMIUM_CACHES.map((name) => path.join(layout.root, name)) },
  ];
}
