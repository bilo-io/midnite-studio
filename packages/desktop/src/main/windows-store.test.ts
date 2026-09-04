import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createWindowsStore, parseStoredState } from './windows-store';

let dirs: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mstudio-windows-store-'));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs = [];
});

describe('createWindowsStore', () => {
  it('round-trips bounds written on close, read back on the next createRoleWindow', async () => {
    const store = createWindowsStore(await tempDir());
    await store.save({ terminal: { x: 10, y: 20, width: 1100, height: 640 } });
    expect(await store.load()).toEqual({ terminal: { x: 10, y: 20, width: 1100, height: 640 } });
  });

  it('returns role defaults (empty) on first launch', async () => {
    expect(await createWindowsStore(await tempDir()).load()).toEqual({});
  });

  it('survives a corrupt file rather than throwing', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'windows.json'), '{ not json', 'utf8');
    expect(await createWindowsStore(dir).load()).toEqual({});
  });

  it('drops a malformed bounds entry rather than trusting it', () => {
    expect(
      parseStoredState({ version: 1, bounds: { terminal: { x: 1, y: 2, width: 'bad' } } }),
    ).toEqual({});
  });

  it('keeps a well-formed entry beside a malformed one', () => {
    expect(
      parseStoredState({
        version: 1,
        bounds: {
          terminal: { x: 1, y: 2, width: 3, height: 4 },
          repos: { x: 'nope' },
        },
      }),
    ).toEqual({ terminal: { x: 1, y: 2, width: 3, height: 4 } });
  });
});
