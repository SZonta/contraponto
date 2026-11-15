import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
