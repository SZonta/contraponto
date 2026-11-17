import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { measureStorage, pathSize } from './disk-usage';

describe('disk usage', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'cp-usage-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('adds up nested files but never counts what a junction points to', async () => {
    const outside = path.join(root, 'outside');
    const data = path.join(root, 'data');
    mkdirSync(outside, { recursive: true });
    writeFileSync(path.join(outside, 'big.bin'), Buffer.alloc(5000));
    mkdirSync(path.join(data, 'nested'), { recursive: true });
    writeFileSync(path.join(data, 'a.txt'), Buffer.alloc(100));
    writeFileSync(path.join(data, 'nested', 'b.txt'), Buffer.alloc(50));
    symlinkSync(outside, path.join(data, 'link'), 'junction');

    expect(await pathSize(data)).toEqual({ bytes: 150, files: 2 });
  });

  it('sums each category over its paths and treats missing ones as empty', async () => {
    const file = path.join(root, 'single.db');
    writeFileSync(file, Buffer.alloc(30));

    expect(await measureStorage([
      { id: 'database', paths: [file, path.join(root, 'single.db-wal')] },
      { id: 'missing', paths: [path.join(root, 'nope')] },
    ])).toEqual([
      { id: 'database', bytes: 30, files: 1 },
      { id: 'missing', bytes: 0, files: 0 },
    ]);
  });
});
