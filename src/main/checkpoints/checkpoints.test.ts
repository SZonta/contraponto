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
