import path from 'node:path';
import { lstat, readdir, rmdir, unlink } from 'node:fs/promises';

const LOCKED = new Set(['EBUSY', 'EPERM', 'ENOTEMPTY']);

/**
 * Deletes a folder without ever entering links: fs.rm follows Windows junctions and empties their targets.
 * Retries while a closing process still holds the folder.
 */
export async function removeFolder(folder: string, attempts = 10, delay = 200): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await removeTree(folder);
    } catch (error) {
      if (attempt >= attempts || !LOCKED.has((error as NodeJS.ErrnoException).code ?? '')) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function removeTree(target: string): Promise<void> {
  let stats;
  try { stats = await lstat(target); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  // Junctions and symlinks report as links here; unlink removes only the link.
  if (stats.isSymbolicLink() || !stats.isDirectory()) return unlink(target);
  for (const name of await readdir(target)) await removeTree(path.join(target, name));
  await rmdir(target);
}
