// @vitest-environment node
// vitest: playlists and the probe cache are index logic over temp-dir fixtures.
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { LibraryChanged } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { INDEX_FILE } from './index-store';
import { createLibraryService } from './library-service';

let base: string;
let media: string;
let data: string;

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'mlib-pl-')));
  media = join(base, 'Music');
  data = join(base, 'data');
  await mkdir(media, { recursive: true });
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const put = async (rel: string) => {
  const path = join(media, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, 'x');
};

async function scanned(events: LibraryChanged[] = []) {
  await put('Artist/Album/01 One.mp3');
  await put('Artist/Album/02 Two.mp3');
  await put('Artist/Album/03 Three.flac');
  const library = createLibraryService({
    dataDir: data,
    pickDirectory: async () => media,
    homeDir: base,
    now: () => 1_700_000_000_000,
    emitChanged: (event) => events.push(event),
  });
  await library.addRoot();
  await library.scan();
  const items = await library.items('music');
  return { library, ids: items.map((item) => item.id) };
}

describe('playlists', () => {
  it('creates, renames, reorders and deletes, persisted in the index', async () => {
    const events: LibraryChanged[] = [];
    const { library, ids } = await scanned(events);
    const [a, b, c] = ids as [string, string, string];
    const created = await library.createPlaylist({ name: ' Road trip ', itemIds: [a, b] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { playlist } = created.value;
    expect(playlist.id).toMatch(/^p[0-9a-f]{12}$/);
    expect(playlist.name).toBe('Road trip');
    expect(events.at(-1)).toEqual({ reason: 'playlists' });

    expect((await library.renamePlaylist({ playlistId: playlist.id, name: 'Drive' })).ok).toBe(
      true,
    );
    expect(
      (await library.setPlaylistItems({ playlistId: playlist.id, itemIds: [c, a, b, a] })).ok,
    ).toBe(true);
    const [listed] = await library.playlists();
    expect(listed?.name).toBe('Drive');
    // Duplicates collapse, order is the caller's.
    expect(listed?.itemIds).toEqual([c, a, b]);

    const onDisk = JSON.parse(await readFile(join(data, INDEX_FILE), 'utf8')) as {
      playlists: Array<{ name: string; itemIds: string[] }>;
    };
    expect(onDisk.playlists).toEqual([
      expect.objectContaining({ name: 'Drive', itemIds: [c, a, b] }),
    ]);

    expect((await library.deletePlaylist(playlist.id)).ok).toBe(true);
    expect(await library.playlists()).toEqual([]);
  });

  it('refuses an item the index does not hold, and an unknown playlist', async () => {
    const { library, ids } = await scanned();
    expect((await library.createPlaylist({ name: 'x', itemIds: ['0'.repeat(20)] })).ok).toBe(false);
    expect((await library.renamePlaylist({ playlistId: 'p000000000000', name: 'x' })).ok).toBe(
      false,
    );
    expect((await library.setPlaylistItems({ playlistId: 'p000000000000', itemIds: ids })).ok).toBe(
      false,
    );
    expect((await library.deletePlaylist('p000000000000')).ok).toBe(false);
  });

  it('keeps an item a rescan lost in the stored list but not on the wire; a removed folder drops it', async () => {
    const { library, ids } = await scanned();
    const created = await library.createPlaylist({ name: 'All', itemIds: ids });
    if (!created.ok) throw new Error('create failed');
    await rm(join(media, 'Artist/Album/02 Two.mp3'));
    await library.scan();
    expect((await library.playlists())[0]?.itemIds).toHaveLength(2);
    await put('Artist/Album/02 Two.mp3');
    await library.scan();
    expect((await library.playlists())[0]?.itemIds).toEqual(ids);

    const [root] = await library.roots();
    await library.removeRoot(root!.id);
    const onDisk = JSON.parse(await readFile(join(data, INDEX_FILE), 'utf8')) as {
      playlists: Array<{ itemIds: string[] }>;
    };
    expect(onDisk.playlists[0]?.itemIds).toEqual([]);
  });

  it('reads an index written before playlists and probes existed', async () => {
    await mkdir(data, { recursive: true });
    await writeFile(
      join(data, INDEX_FILE),
      JSON.stringify({
        version: 1,
        roots: [],
        items: {},
        progress: {},
        settings: { onlineMetadata: true, onlineProvider: 'tmdb' },
      }),
    );
    const library = createLibraryService({ dataDir: data, pickDirectory: async () => null });
    expect(await library.playlists()).toEqual([]);
    // Kept, not set aside as unreadable: the user's setting survived.
    expect((await library.getSettings()).settings.onlineMetadata).toBe(true);
  });
});

describe('probe cache', () => {
  it('answers a stored probe until the file changes', async () => {
    const { library, ids } = await scanned();
    const id = ids[0]!;
    const item = (await library.item(id))!;
    expect(await library.cachedProbe(id)).toBeNull();
    const probe = {
      size: item.size,
      mtimeMs: item.mtimeMs,
      container: 'mp3',
      video: null,
      audio: 'mp3',
      durationS: 1,
    };
    await library.storeProbe(id, probe);
    expect(await library.cachedProbe(id)).toEqual(probe);
    await library.storeProbe(id, { ...probe, size: item.size + 1 });
    expect(await library.cachedProbe(id)).toBeNull();
    // Not for an item the index does not hold.
    await library.storeProbe('f'.repeat(20), probe);
    expect(await library.cachedProbe('f'.repeat(20))).toBeNull();
  });
});
