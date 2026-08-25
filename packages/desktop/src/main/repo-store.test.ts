import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createRepoStore, parseStoredState } from './repo-store';

let dirs: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mgit-store-'));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs = [];
});

describe('createRepoStore', () => {
  it('round-trips the open list', async () => {
    const store = createRepoStore(await tempDir());
    await store.save(['/a/repo', '/b/repo']);
    expect(await store.load()).toEqual(['/a/repo', '/b/repo']);
  });

  it('returns an empty list on first launch', async () => {
    expect(await createRepoStore(await tempDir()).load()).toEqual([]);
  });

  it('survives a corrupt file rather than failing boot', async () => {
    // Losing the recently-opened list is a nuisance; refusing to start is not
    // an acceptable response to it.
    const dir = await tempDir();
    await writeFile(join(dir, 'repos.json'), '{ not json', 'utf8');
    expect(await createRepoStore(dir).load()).toEqual([]);
  });

  it('swallows a write to an unwritable directory', async () => {
    const store = createRepoStore('/proc/definitely-not-writable');
    await expect(store.save(['/a'])).resolves.toBeUndefined();
  });

  it('writes a versioned document', async () => {
    // The version field is what lets a future format change migrate instead of
    // silently misreading the old shape.
    const dir = await tempDir();
    await createRepoStore(dir).save(['/a']);
    const raw: unknown = JSON.parse(await readFile(join(dir, 'repos.json'), 'utf8'));
    expect(raw).toEqual({ version: 1, paths: ['/a'] });
  });
});

describe('parseStoredState', () => {
  it('keeps only non-empty strings', () => {
    expect(parseStoredState({ paths: ['/a', '', 42, null, '/b'] })).toEqual(['/a', '/b']);
  });

  it('rejects anything that is not a paths array', () => {
    expect(parseStoredState(null)).toEqual([]);
    expect(parseStoredState([])).toEqual([]);
    expect(parseStoredState({ paths: 'nope' })).toEqual([]);
  });
});
