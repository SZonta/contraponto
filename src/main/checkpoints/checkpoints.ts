import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export type FileChange = { status: 'added' | 'modified' | 'deleted'; path: string };

/**
 * Never worth a checkpoint, even in folders without a .gitignore: dependencies, caches and
 * backups that their tools recreate (Blender's .blend1 backups and .blend@ saves included).
 */
/** Larger files are left out of checkpoints: one copy per changed version would fill the disk. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
const SKIPPED_HEADER = 'Over the size limit, not in this checkpoint:';
const SNAPSHOT_REFS = 'refs/contraponto/snapshots/';
/** git gc rewrites the whole repository, so it waits until a few snapshots were dropped. */
const GC_AFTER_DROPS = 10;

/** The creation time in the name orders snapshots made within the same second. */
function snapshotRef(time: number, id: string): string {
  return `${SNAPSHOT_REFS}${String(time).padStart(15, '0')}-${id}`;
}

export const BUILT_IN_EXCLUDES =['node_modules/', '.venv/', 'venv/', '__pycache__/', '.godot/', '.cache/', '*.blend[0-9]', '*.blend@', '*.tmp'];

/**
 * Snapshots of a project folder kept in a "shadow" git repository outside it.
 * The project's own git (if any) is never touched; its .gitignore is respected.
 */
export class Checkpoints {
  private readonly env: NodeJS.ProcessEnv;

  constructor(
    shadowDir: string,
    private readonly workTree: string,
    private readonly maxFileBytes = MAX_FILE_BYTES,
  ) {
    this.env = {
      ...process.env,
      GIT_DIR: shadowDir,
      GIT_WORK_TREE: workTree,
      GIT_AUTHOR_NAME: 'Contraponto',
      GIT_AUTHOR_EMAIL: 'checkpoints@contraponto.local',
      GIT_COMMITTER_NAME: 'Contraponto',
      GIT_COMMITTER_EMAIL: 'checkpoints@contraponto.local',
    };
    let created: Promise<unknown> = Promise.resolve();
    if (!existsSync(shadowDir)) {
      mkdirSync(shadowDir, { recursive: true });
      // init must run without GIT_WORK_TREE; afterwards the repository is used with the project as its work tree.
      created = run('git', ['init', '--bare', '--quiet', shadowDir], { windowsHide: true })
        .then(() => this.git('config', 'core.bare', 'false'))
        .then(() => this.git('config', 'core.autocrlf', 'false'));
    }
    // Rewritten every start, so repositories made by older versions get the current list too.
    this.ready = created.then(() => {
      mkdirSync(path.join(shadowDir, 'info'), { recursive: true });
      writeFileSync(path.join(shadowDir, 'info', 'exclude'), `${BUILT_IN_EXCLUDES.join('\n')}\n`);
    });
  }

  private ready: Promise<unknown> = Promise.resolve();

  /** Records the current state of the folder and returns the snapshot id. Files over the size limit stay out. */
  async snapshot(label: string): Promise<string> {
    await this.ready;
    const skipped = await this.oversized();
    await this.git('add', '--all', '--', '.', ...skipped.map((file) => `:(literal,exclude)${file}`));
    const tree = await this.git('write-tree');
    const note = skipped.length ? ['-m', [SKIPPED_HEADER, ...skipped].join('\n')] : [];
    // No parent: each snapshot stands alone, so old ones can be deleted without the newer ones.
    const commit = await this.git('commit-tree', tree, '-m', label, ...note);
    await this.git('update-ref', snapshotRef(Date.now(), commit), commit);
    return commit;
  }

  /**
   * Deletes the snapshots older than every one in `keep` and, now and then, the files only
   * they used. Snapshots newer than those (a turn still running) always stay.
   */
  async keepOnly(keep: string[], compactNow = false): Promise<void> {
    await this.ready;
    const listed = await this.git('for-each-ref', '--format=%(refname) %(objectname)', SNAPSHOT_REFS);
    const refs = listed.split('\n').filter(Boolean).map((line) => {
      const [name, id] = line.split(' ');
      return { name, id, time: Number(name.slice(SNAPSHOT_REFS.length).split('-')[0]) };
    });
    // Older versions only reached their snapshots through one chained ref. Pinned with time 0,
    // they hold every newer snapshot until they leave the kept turns, so nothing in use is lost.
    const known = new Set(refs.map((ref) => ref.id));
    for (const id of keep.filter((item) => !known.has(item))) {
      const name = snapshotRef(0, id);
      if (await this.git('update-ref', name, id).then(() => true, () => false)) refs.push({ name, id, time: 0 });
    }
    const kept = refs.filter((ref) => keep.includes(ref.id));
    const oldest = kept.length ? Math.min(...kept.map((ref) => ref.time)) : 0;
    const drop = refs.filter((ref) => !keep.includes(ref.id) && ref.time < oldest);
    if (!drop.length && !compactNow) return;
    for (const ref of drop) await this.git('update-ref', '-d', ref.name);
    await this.git('update-ref', '-d', 'refs/contraponto/head').catch(() => {});
    this.dropped += drop.length;
    if (compactNow || this.dropped >= GC_AFTER_DROPS) {
      this.dropped = 0;
      await this.git('gc', '--prune=now', '--quiet');
    }
  }

  private dropped = 0;

  /** Files a snapshot left out for being over the size limit; undo cannot bring them back. */
  async skippedIn(ref: string): Promise<string[]> {
    const lines = (await this.git('log', '-1', '--format=%B', ref)).split('\n').map((line) => line.trim());
    const start = lines.indexOf(SKIPPED_HEADER);
    return start < 0 ? [] : lines.slice(start + 1).filter(Boolean);
  }

  /** New or changed files over the limit; unchanged ones are already in the repository. */
  private async oversized(): Promise<string[]> {
    const listed = await this.git('ls-files', '-z', '--others', '--modified', '--exclude-standard');
    return [...new Set(listed.split('\0').filter(Boolean))].filter((file) => {
      try { return statSync(path.join(this.workTree, file)).size > this.maxFileBytes; } catch { return false; }
    });
  }

  /** Disk space the repository's objects take, loose and packed. */
  async storedBytes(): Promise<number> {
    await this.ready;
    const stats = await this.git('count-objects', '-v');
    const kib = (key: string) => Number(stats.match(new RegExp(`^${key}: (\\d+)`, 'm'))?.[1] ?? 0);
    return (kib('size') + kib('size-pack')) * 1024;
  }

  async changes(from: string, to: string): Promise<FileChange[]> {
    const output = await this.git('diff', '--name-status', '--no-renames', from, to);
    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [code, file] = line.split('\t');
        return { status: code === 'A' ? 'added' : code === 'D' ? 'deleted' : 'modified', path: file };
      });
  }

  /** Puts every file changed between `from` and `to` back to how it was in `from`. */
  async restore(from: string, to: string): Promise<FileChange[]> {
    const changed = await this.changes(from, to);
    const toRecover = changed.filter((change) => change.status !== 'added').map((change) => change.path);
    for (const change of changed.filter((item) => item.status === 'added')) {
      rmSync(path.join(this.workTree, change.path), { force: true });
    }
    if (toRecover.length) await this.git('checkout', from, '--', ...toRecover);
    return changed;
  }

  private async git(...args: string[]): Promise<string> {
    const { stdout } = await run('git', args, { env: this.env, cwd: this.workTree, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    return stdout.trim();
  }
}
