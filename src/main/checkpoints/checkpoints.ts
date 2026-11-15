import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export type FileChange = { status: 'added' | 'modified' | 'deleted'; path: string };

/**
 * Snapshots of a project folder kept in a "shadow" git repository outside it.
 * The project's own git (if any) is never touched; its .gitignore is respected.
 */
export class Checkpoints {
  private readonly env: NodeJS.ProcessEnv;

  constructor(
    shadowDir: string,
    private readonly workTree: string,
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
    if (!existsSync(shadowDir)) {
      mkdirSync(shadowDir, { recursive: true });
      // init must run without GIT_WORK_TREE; afterwards the repository is used with the project as its work tree.
      this.ready = run('git', ['init', '--bare', '--quiet', shadowDir], { windowsHide: true })
        .then(() => this.git('config', 'core.bare', 'false'))
        .then(() => this.git('config', 'core.autocrlf', 'false'));
    }
  }

  private ready: Promise<unknown> = Promise.resolve();

  /** Records the current state of the folder and returns the snapshot id. */
  async snapshot(label: string): Promise<string> {
    await this.ready;
    await this.git('add', '--all', '--', '.');
    const tree = await this.git('write-tree');
    const parent = await this.git('rev-parse', '--verify', '--quiet', 'refs/contraponto/head').catch(() => '');
    const commit = await this.git('commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', label);
    await this.git('update-ref', 'refs/contraponto/head', commit);
    return commit;
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
