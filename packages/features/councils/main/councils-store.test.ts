// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Council } from '@midnite/studio-shared';
import { afterEach, describe, expect, it } from 'vitest';

import { COUNCILS_STORE_VERSION, createCouncilsStore, parseStoredCouncils } from './councils-store';

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
  synthesisType: 'brainstorm',
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

describe('councils.json v1 → v2 (Phase 134)', () => {
  it('migrates a v1 council to a brainstorm and saves as v2', async () => {
    const dir = await tempDir();
    const { synthesisType: _type, ...v1 } = sample;
    await writeFile(join(dir, 'councils.json'), JSON.stringify({ version: 1, councils: [v1] }), 'utf8');
    const store = createCouncilsStore(dir);
    const loaded = await store.load();
    expect(loaded[0]?.synthesisType).toBe('brainstorm');
    await store.save(loaded);
    const raw = JSON.parse(await readFile(join(dir, 'councils.json'), 'utf8')) as { version: number };
    expect(raw.version).toBe(COUNCILS_STORE_VERSION);
  });

  it('keeps a v2 council\'s type and instructions', () => {
    const council = { ...sample, synthesisType: 'debate', synthInstructions: 'Pick a winner.' };
    expect(parseStoredCouncils({ version: 2, councils: [council] })[0]).toMatchObject({ synthesisType: 'debate', synthInstructions: 'Pick a winner.' });
  });
});
