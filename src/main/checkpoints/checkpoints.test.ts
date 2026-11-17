import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Checkpoints } from './checkpoints';

describe('Checkpoints', () => {
  let root: string;
  let project: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'cp-checkpoints-'));
    project = path.join(root, 'project');
    execFileSync('git', ['init', '-q', project]);
    writeFileSync(path.join(project, '.gitignore'), 'build/\n');
    writeFileSync(path.join(project, 'keep.txt'), 'original');
    writeFileSync(path.join(project, 'edit.txt'), 'before');
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('lists what changed between two snapshots, ignoring .gitignore entries', async () => {
    const checkpoints = new Checkpoints(path.join(root, 'shadow.git'), project);
    const before = await checkpoints.snapshot('before');
    writeFileSync(path.join(project, 'edit.txt'), 'after');
    writeFileSync(path.join(project, 'new.txt'), 'new');
    rmSync(path.join(project, 'keep.txt'));
    execFileSync('git', ['-C', project, 'status']); // project git still works
    writeFileSync(path.join(project, '.gitignore'), 'build/\n');
    const after = await checkpoints.snapshot('after');

    const changes = await checkpoints.changes(before, after);
    expect(changes).toEqual(
      expect.arrayContaining([
        { status: 'modified', path: 'edit.txt' },
        { status: 'added', path: 'new.txt' },
        { status: 'deleted', path: 'keep.txt' },
      ]),
    );
    expect(changes).toHaveLength(3);
  });

  it('leaves dependencies, caches and Blender backups out even without a .gitignore', async () => {
    const folder = path.join(root, 'scratch');
    mkdirSync(path.join(folder, 'node_modules', 'pkg'), { recursive: true });
    mkdirSync(path.join(folder, 'game', '.godot'), { recursive: true });
    writeFileSync(path.join(folder, 'node_modules', 'pkg', 'index.js'), 'x');
    writeFileSync(path.join(folder, 'game', '.godot', 'cache.bin'), 'x');
    writeFileSync(path.join(folder, 'scene.blend'), 'x');
    writeFileSync(path.join(folder, 'scene.blend1'), 'x');
    const shadow = path.join(root, 'scratch.git');

    const snapshot = await new Checkpoints(shadow, folder).snapshot('before');

    const files = execFileSync('git', ['--git-dir', shadow, 'ls-tree', '-r', '--name-only', snapshot], { encoding: 'utf8' }).trim().split('\n');
    expect(files).toEqual(['scene.blend']);
  });

  it('leaves files over the size limit out and records which ones', async () => {
    const shadow = path.join(root, 'limit.git');
    const checkpoints = new Checkpoints(shadow, project, 10);
    writeFileSync(path.join(project, 'big file.blend'), 'x'.repeat(11));

    const snapshot = await checkpoints.snapshot('after');

    const files = execFileSync('git', ['--git-dir', shadow, 'ls-tree', '-r', '--name-only', snapshot], { encoding: 'utf8' });
    expect(files).not.toContain('big file.blend');
    expect(files).toContain('keep.txt');
    expect(await checkpoints.skippedIn(snapshot)).toEqual(['big file.blend']);
  });

  it('deletes snapshots older than the kept ones, never newer ones', async () => {
    const shadow = path.join(root, 'keep.git');
    const checkpoints = new Checkpoints(shadow, project);
    const ids: string[] = [];
    for (let turn = 0; turn < 6; turn++) {
      writeFileSync(path.join(project, 'edit.txt'), `turn ${turn}`);
      ids.push(await checkpoints.snapshot(`turn ${turn}`));
    }

    await checkpoints.keepOnly([ids[3], ids[4]]);

    const left = execFileSync('git', ['--git-dir', shadow, 'for-each-ref', '--format=%(objectname)'], { encoding: 'utf8' }).trim().split('\n');
    expect(left.sort()).toEqual([ids[3], ids[4], ids[5]].sort());
    expect(await checkpoints.changes(ids[3], ids[5])).toEqual([{ status: 'modified', path: 'edit.txt' }]);
  });

  it('removes the files of deleted snapshots once enough were dropped', async () => {
    const shadow = path.join(root, 'gc.git');
    const checkpoints = new Checkpoints(shadow, project);
    const ids: string[] = [];
    for (let turn = 0; turn < 12; turn++) {
      writeFileSync(path.join(project, 'edit.txt'), `turn ${turn}`);
      ids.push(await checkpoints.snapshot(`turn ${turn}`));
    }

    await checkpoints.keepOnly([ids[11]]);

    const stats = execFileSync('git', ['--git-dir', shadow, 'count-objects', '-v'], { encoding: 'utf8' });
    expect(stats).toMatch(/^count: 0$/m);
    expect(() => execFileSync('git', ['--git-dir', shadow, 'cat-file', '-e', ids[0]], { stdio: 'ignore' })).toThrow();
    expect(await checkpoints.changes(ids[11], ids[11])).toEqual([]);
  });

  it('restores a turn without touching the project repository', async () => {
    const checkpoints = new Checkpoints(path.join(root, 'shadow.git'), project);
    const before = await checkpoints.snapshot('before');
    writeFileSync(path.join(project, 'edit.txt'), 'after');
    writeFileSync(path.join(project, 'new.txt'), 'new');
    rmSync(path.join(project, 'keep.txt'));
    const after = await checkpoints.snapshot('after');

    await checkpoints.restore(before, after);

    expect(readFileSync(path.join(project, 'edit.txt'), 'utf8')).toBe('before');
    expect(readFileSync(path.join(project, 'keep.txt'), 'utf8')).toBe('original');
    expect(existsSync(path.join(project, 'new.txt'))).toBe(false);
    const commits = execFileSync('git', ['-C', project, 'rev-list', '--all', '--count'], { encoding: 'utf8' }).trim();
    expect(commits).toBe('0');
  });
});
