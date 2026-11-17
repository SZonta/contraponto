import path from 'node:path';
import { lstat, readdir } from 'node:fs/promises';

/** A named group of files and folders whose sizes add up together. */
export type StorageCategory = { id: string; paths: string[] };

export type CategoryUsage = { id: string; bytes: number; files: number };

/** Bytes and file count under a path; links are never followed, so nothing outside is counted. */
export async function pathSize(target: string): Promise<{ bytes: number; files: number }> {
  let stats;
  try { stats = await lstat(target); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { bytes: 0, files: 0 };
    throw error;
  }
  if (stats.isSymbolicLink()) return { bytes: 0, files: 0 };
  if (!stats.isDirectory()) return { bytes: stats.size, files: 1 };
  const total = { bytes: 0, files: 0 };
  for (const name of await readdir(target)) {
    const part = await pathSize(path.join(target, name));
    total.bytes += part.bytes;
    total.files += part.files;
  }
  return total;
}

export async function measureStorage(categories: StorageCategory[]): Promise<CategoryUsage[]> {
  const result: CategoryUsage[] = [];
  for (const category of categories) {
    const usage = { id: category.id, bytes: 0, files: 0 };
    for (const item of category.paths) {
      const part = await pathSize(item);
      usage.bytes += part.bytes;
      usage.files += part.files;
    }
    result.push(usage);
  }
  return result;
}
