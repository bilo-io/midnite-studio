import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Council } from '@midnite/studio-shared';
import { afterEach, describe, expect, it } from 'vitest';

import { createCouncilsStore, parseStoredCouncils } from './councils-store';

let dirs: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mstudio-councils-'));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs = [];
});

const sample: Council = {
  id: 'c1',
  name: 'Architecture review',
  members: [{ id: 'm1', name: 'Optimist', provider: 'agy', role: 'Argue the best case.' }],
  synthProvider: 'codex',
  createdAt: 1,
  updatedAt: 1,
};

describe('createCouncilsStore', () => {
  it('loads an empty list when the file is missing', async () => {
    const dir = await tempDir();
    const store = createCouncilsStore(dir);
    expect(await store.load()).toEqual([]);
  });

  it('round-trips a council through save/load', async () => {
    const dir = await tempDir();
    const store = createCouncilsStore(dir);
    await store.save([sample]);
    expect(await store.load()).toEqual([sample]);
  });

  it('drops one malformed entry rather than the whole file', async () => {
    const dir = await tempDir();
    await writeFile(
      join(dir, 'councils.json'),
      JSON.stringify({ version: 1, councils: [sample, { id: 'bad' }] }),
      'utf8',
    );
    const store = createCouncilsStore(dir);
    expect(await store.load()).toEqual([sample]);
  });

  it('starts empty on a corrupt file rather than throwing', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'councils.json'), '{not json', 'utf8');
    const store = createCouncilsStore(dir);
    expect(await store.load()).toEqual([]);
  });
});

describe('parseStoredCouncils', () => {
  it('rejects a non-object value', () => {
    expect(parseStoredCouncils(null)).toEqual([]);
    expect(parseStoredCouncils('nope')).toEqual([]);
  });

  it('rejects a payload with no councils array', () => {
    expect(parseStoredCouncils({ version: 1 })).toEqual([]);
  });
});
