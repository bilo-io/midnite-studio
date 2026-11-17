// @vitest-environment node
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createOpenedGamesStore } from './opened-games';

let dir: string;
beforeEach(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'midnite-opened-')));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('opened games store', () => {
  it('reads an empty list when the file is missing or corrupt', async () => {
    const store = createOpenedGamesStore(dir);
    expect(await store.list()).toEqual([]);
    await writeFile(join(dir, 'opened-games.json'), '{ nope', 'utf8');
    expect(await store.list()).toEqual([]);
    await writeFile(join(dir, 'opened-games.json'), '{"version":1,"paths":[1,"/a",""]}', 'utf8');
    expect(await store.list()).toEqual(['/a']);
  });

  it('appends and dedupes by realpath', async () => {
    const game = join(dir, 'game');
    await mkdir(game);
    const link = join(dir, 'link');
    await symlink(game, link);
    const store = createOpenedGamesStore(dir);
    expect(await store.add(game)).toEqual({ ok: true });
    expect(await store.add(link)).toEqual({ ok: true });
    expect(await store.add(game)).toEqual({ ok: true });
    expect(await store.list()).toEqual([game]);
  });

  it('keeps a stored path whose folder has gone, so a re-attached drive brings it back', async () => {
    const store = createOpenedGamesStore(dir);
    await store.add(join(dir, 'gone'));
    expect(await store.list()).toEqual([join(dir, 'gone')]);
  });

  it('removes a path by realpath, leaves the others and the folder alone, and tolerates an unknown path', async () => {
    const a = join(dir, 'a');
    const b = join(dir, 'b');
    await mkdir(a);
    await mkdir(b);
    const link = join(dir, 'a-link');
    await symlink(a, link);
    const store = createOpenedGamesStore(dir);
    await store.add(a);
    await store.add(b);
    expect(await store.remove(link)).toEqual({ ok: true });
    expect(await store.list()).toEqual([b]);
    expect(await store.remove(join(dir, 'never-added'))).toEqual({ ok: true });
    expect(await store.list()).toEqual([b]);
    await expect(realpath(a)).resolves.toBe(a);
  });
});
