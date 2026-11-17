import path from 'node:path';
import { readdirSync } from 'node:fs';
import { chatFolders, checkpointRepo, type StorageLayout } from './layout';
import { removeFolder } from './remove-folder';
import type { Store } from './store';

function entries(folder: string): string[] {
  try { return readdirSync(folder); } catch { return []; }
}

/**
 * Removes what no chat or project owns anymore: private chat folders, per-chat files and
 * checkpoint repositories left by deletes that could not finish or by older versions.
 */
export async function sweepOrphans(layout: StorageLayout, store: Store): Promise<void> {
  const projects = store.listProjects();
  const scratchFolders = new Set(projects.filter((project) => project.scratch).map((project) => path.resolve(project.path).toLowerCase()));
  const projectIds = new Set(projects.map((project) => project.id));
  const chatIds = new Set(store.listChats().map((chat) => chat.id));
  const orphans = [
    ...entries(layout.chats).map((name) => path.resolve(layout.chats, name)).filter((folder) => !scratchFolders.has(folder.toLowerCase())),
    ...entries(layout.chatFiles).filter((name) => !chatIds.has(name)).map((name) => path.join(layout.chatFiles, name)),
    ...entries(layout.shadow).filter((name) => name.endsWith('.git') && !projectIds.has(name.slice(0, -4))).map((name) => path.join(layout.shadow, name)),
  ];
  await Promise.all(orphans.map((folder) => removeFolder(folder).catch(() => {})));
}

/** After a chat is deleted: its files, and the checkpoints of its private project when that went too. */
export async function removeChatData(layout: StorageLayout, store: Store, chatId: string, projectId: string): Promise<void> {
  const removals = [removeFolder(chatFolders(layout, chatId).root)];
  if (!store.getProject(projectId)) removals.push(removeFolder(checkpointRepo(layout, projectId)));
  await Promise.all(removals.map((removal) => removal.catch(() => {})));
}
