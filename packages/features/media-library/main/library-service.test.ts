// @vitest-environment node
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { libraryFileUrl, type LibraryChanged, type LibraryItem } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveLibraryFileUrl } from './file-url';
import { INDEX_FILE } from './index-store';
import { createLibraryService, type LibraryServiceDeps } from './library-service';
import { createTmdbProvider } from './online';
import { FAKE_JPEG, id3v23 } from './test-fixtures';

/**
 * The library against temp-dir fixtures only — every root here is a folder this suite made under the
 * OS temp dir, and the "network" is a fetch that answers from a table (or fails the test if called).
 */

let base: string;
let media: string;
let data: string;

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'mlib-svc-')));
  media = join(base, 'Media');
  data = join(base, 'data');
  await mkdir(media, { recursive: true });
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const put = async (rel: string, bytes: Uint8Array | string = 'x') => {
  const path = join(media, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return path;
};

const neverFetch = vi.fn(async () => {
  throw new Error('the library made a network call with the online provider off');
}) as unknown as typeof fetch;

const service = (extra: Partial<LibraryServiceDeps> = {}) =>
  createLibraryService({
    dataDir: data,
    pickDirectory: async () => media,
    homeDir: base,
    now: () => 1_700_000_000_000,
    ...extra,
  });

const byTitle = (items: LibraryItem[], title: string) => {
  const hit = items.find((item) => item.title === title);
  if (!hit) throw new Error(`no item titled ${title}: ${items.map((i) => i.title).join(', ')}`);
  return hit;
};

async function seedLibrary() {
  await put('Films/Up (2009)/Up (2009).mkv');
  await put('Films/Up (2009)/poster.jpg', FAKE_JPEG);
  await put(
    'Films/Up (2009)/Up (2009).nfo',
    '<movie><title>Up</title><year>2009</year><plot>Balloons.</plot></movie>',
  );
  await put('Films/Loose One.mp4');
  await put('Films/Loose Two.mp4');
  await put('Films/folder.jpg', FAKE_JPEG); // shared folder of loose films: not either one's poster
  await put('TV/The Wire/Season 1/The.Wire.S01E01.mkv');
  await put('TV/The Wire/Season 1/The.Wire.S01E02.mkv');
  await put('TV/The Wire/poster.jpg', FAKE_JPEG);
  await put(
    'Music/Björk/Homogenic (1997)/03 - Joga.mp3',
    id3v23({ title: 'Jóga', artist: 'Björk', album: 'Homogenic', track: '3', picture: FAKE_JPEG }),
  );
  await put('Music/Björk/Homogenic (1997)/04 - Unravel.mp3', 'not really an mp3');
  await put('Photos/Lisbon/IMG_0001.jpg', FAKE_JPEG);
  await put('Photos/Lisbon/notes.txt', 'ignored');
  await put('.hidden/secret.mkv');
  await put('@eaDir/thumb.mkv');
}

describe('roots', () => {
  it('adds the picked folder, and nothing when the picker is cancelled', async () => {
    const lib = service({ pickDirectory: async () => null });
    expect(await lib.addRoot()).toEqual({ ok: true, value: { root: null } });
    const picked = await service().addRoot();
    expect(picked.ok && picked.value.root?.path).toBe(media);
  });

  it('refuses the disk, the home folder, a duplicate and nesting either way', async () => {
    const lib = service();
    expect((await lib.addRootPath('/')).ok).toBe(false);
    expect((await lib.addRootPath(base)).ok).toBe(false); // homeDir
    expect((await lib.addRootPath('relative/path')).ok).toBe(false);
    expect((await lib.addRootPath(join(base, 'nope'))).ok).toBe(false);
    await mkdir(join(media, 'Films'), { recursive: true });
    expect((await lib.addRootPath(join(media, 'Films'))).ok).toBe(true);
    expect((await lib.addRootPath(join(media, 'Films'))).ok).toBe(false);
    expect((await lib.addRootPath(media)).ok).toBe(false); // holds Films
    await mkdir(join(media, 'Films', 'Kids'), { recursive: true });
    expect((await lib.addRootPath(join(media, 'Films', 'Kids'))).ok).toBe(false); // inside Films
  });

  it('persists roots, and removing one drops its items and progress', async () => {
    await seedLibrary();
    const changes: LibraryChanged[] = [];
    const lib = service({ emitChanged: (c) => changes.push(c) });
    const added = await lib.addRootPath(media);
    if (!added.ok) throw new Error('add failed');
    await lib.scan();
    const up = byTitle(await lib.items('film'), 'Up');
    await lib.setProgress({ itemId: up.id, positionS: 600, durationS: 5760 });

    const reopened = service();
    expect((await reopened.roots()).map((r) => r.id)).toEqual([added.value.root.id]);
    expect(byTitle(await reopened.items('film'), 'Up').progress?.positionS).toBe(600);

    expect((await reopened.removeRoot(added.value.root.id)).ok).toBe(true);
    expect(await reopened.items()).toEqual([]);
    const index = JSON.parse(await readFile(join(data, INDEX_FILE), 'utf8'));
    expect(index.progress).toEqual({});
    expect(changes.map((c) => c.reason)).toEqual(['roots', 'scan', 'progress']);
  });
});

describe('scan', () => {
  it('classifies films, shows, music and photos, with local metadata and art', async () => {
    await seedLibrary();
    const lib = service({ online: createTmdbProvider(neverFetch), readKey: async () => 'k' });
    await lib.addRootPath(media);
    const summary = await lib.scan();
    expect(summary).toMatchObject({ ok: true, value: { added: 8, updated: 0, removed: 0 } });

    const items = await lib.items();
    expect(items.map((i) => i.kind).sort()).toEqual([
      'film',
      'film',
      'film',
      'music',
      'music',
      'photo',
      'show',
      'show',
    ]);
    expect(items.some((i) => i.path.includes('.hidden') || i.path.includes('@eaDir'))).toBe(false);

    const up = byTitle(items, 'Up');
    expect(up).toMatchObject({
      year: 2009,
      plot: 'Balloons.',
      source: 'local',
      art: { path: 'Films/Up (2009)/poster.jpg' },
    });
    expect(byTitle(items, 'Loose One').art).toBeNull();

    const episode = items.find((i) => i.kind === 'show' && i.episode === 2);
    expect(episode).toMatchObject({
      showTitle: 'The Wire',
      season: 1,
      art: { path: 'TV/The Wire/poster.jpg' },
    });

    const joga = byTitle(items, 'Jóga');
    expect(joga).toMatchObject({
      artist: 'Björk',
      album: 'Homogenic',
      track: 3,
      art: { rootId: 'art' },
    });
    // Untagged: falls back to the filename and folders.
    expect(byTitle(items, 'Unravel')).toMatchObject({
      artist: 'Björk',
      album: 'Homogenic',
      track: 4,
      art: null,
    });

    const photo = items.find((i) => i.kind === 'photo');
    expect(photo).toMatchObject({ album: 'Lisbon', art: { path: 'Photos/Lisbon/IMG_0001.jpg' } });

    // Online is off by default: the provider was never asked.
    expect(neverFetch).not.toHaveBeenCalled();
  });

  it('never follows a symlink out of the root', async () => {
    const outside = join(base, 'outside');
    await mkdir(outside);
    await writeFile(join(outside, 'Escape (2001).mkv'), 'x');
    await symlink(outside, join(media, 'link'));
    await symlink(join(outside, 'Escape (2001).mkv'), join(media, 'Escape (2001).mkv'));
    const lib = service();
    await lib.addRootPath(media);
    await lib.scan();
    expect(await lib.items()).toEqual([]);
  });

  it('rescans incrementally: unchanged files are kept, changed ones re-read, gone ones dropped', async () => {
    await seedLibrary();
    const lib = service();
    await lib.addRootPath(media);
    await lib.scan();
    const joga = byTitle(await lib.items('music'), 'Jóga');
    await lib.setProgress({ itemId: joga.id, positionS: 60, durationS: 300 });

    // Retag one file (new size and mtime), delete another, add a third.
    const path = await put(
      'Music/Björk/Homogenic (1997)/03 - Joga.mp3',
      id3v23({ title: 'Jóga (Remastered)', artist: 'Björk' }),
    );
    await utimes(path, new Date(), new Date(Date.now() + 5_000));
    await rm(join(media, 'Films/Loose Two.mp4'));
    await put('Films/Heat (1995)/movie.mkv');

    const again = await lib.scan();
    expect(again).toMatchObject({ ok: true, value: { added: 1, updated: 1, removed: 1 } });
    const items = await lib.items();
    const retagged = byTitle(items, 'Jóga (Remastered)');
    expect(retagged.id).toBe(joga.id);
    expect(retagged.progress?.positionS).toBe(60); // progress survives a rescan
    expect(byTitle(items, 'Heat').year).toBe(1995);
    expect(items.some((i) => i.title === 'Loose Two')).toBe(false);

    // A third scan with nothing changed touches nothing.
    expect(await lib.scan()).toMatchObject({
      ok: true,
      value: { added: 0, updated: 0, removed: 0 },
    });
    // The retagged file's embedded cover is gone, so its cached art was pruned.
    expect(await readdir(join(data, 'art'))).toHaveLength(0);
  });

  it('runs one scan at a time and reports progress', async () => {
    await seedLibrary();
    const phases: string[] = [];
    const lib = service({ emitScanProgress: (p) => phases.push(p.phase) });
    await lib.addRootPath(media);
    const [a, b] = [lib.scan(), lib.scan()];
    expect(a).toBe(b);
    await a;
    expect(phases.at(-1)).toBe('done');
    expect((await lib.scan('rdeadbeef00')).ok).toBe(false);
  });
});

describe('progress', () => {
  it('saves, marks finished near the end, and clears', async () => {
    await put('Up (2009).mkv');
    const lib = service();
    await lib.addRootPath(media);
    await lib.scan();
    const [up] = await lib.items();
    if (!up) throw new Error('no item');
    await lib.setProgress({ itemId: up.id, positionS: 120, durationS: 1000 });
    expect((await lib.items())[0]?.progress).toMatchObject({ positionS: 120, finished: false });
    await lib.setProgress({ itemId: up.id, positionS: 950, durationS: 1000 });
    expect((await lib.items())[0]?.progress).toMatchObject({ positionS: 0, finished: true });
    await lib.clearProgress(up.id);
    expect((await lib.items())[0]?.progress).toBeNull();
    expect((await lib.setProgress({ itemId: 'nope', positionS: 1, durationS: 2 })).ok).toBe(false);
  });
});

describe('the online provider', () => {
  const tmdb = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.hostname === 'api.themoviedb.org') {
      const isTv = url.pathname.endsWith('/tv');
      return new Response(
        JSON.stringify({
          results: [
            isTv
              ? {
                  name: 'The Wire',
                  overview: 'Baltimore.',
                  first_air_date: '2002-06-02',
                  poster_path: '/wire.jpg',
                }
              : {
                  title: 'Loose One',
                  overview: 'A loose film.',
                  release_date: '2011-01-01',
                  poster_path: '/loose.jpg',
                },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.hostname === 'image.tmdb.org')
      return new Response(FAKE_JPEG, {
        status: 200,
        headers: { 'content-length': String(FAKE_JPEG.length) },
      });
    throw new Error(`unexpected host ${url.hostname}`);
  }) as unknown as typeof fetch;

  beforeEach(() => {
    vi.mocked(tmdb).mockClear();
  });

  it('is off by default, and sends nothing — nor reads the key — while off', async () => {
    await seedLibrary();
    const readKey = vi.fn(async () => 'v3key');
    const lib = service({ online: createTmdbProvider(tmdb), readKey });
    await lib.addRootPath(media);
    await lib.scan();
    expect(tmdb).not.toHaveBeenCalled();
    expect(await lib.getSettings()).toEqual({
      settings: { onlineMetadata: false, onlineProvider: 'tmdb' },
      onlineKeyAvailable: false, // off: the key is not even read
    });
    expect(readKey).not.toHaveBeenCalled();
  });

  it('when switched on, fills what local metadata did not, once per item', async () => {
    await seedLibrary();
    const lib = service({ online: createTmdbProvider(tmdb), readKey: async () => 'v3key' });
    await lib.addRootPath(media);
    await lib.setSettings({ onlineMetadata: true });
    await lib.scan();
    const items = await lib.items();
    expect(byTitle(items, 'Loose One')).toMatchObject({
      plot: 'A loose film.',
      year: 2011,
      source: 'online',
      art: { rootId: 'art' },
    });
    // Local metadata wins: Up already had a plot and a poster.
    expect(byTitle(items, 'Up')).toMatchObject({ plot: 'Balloons.', source: 'local' });
    const episode = items.find((i) => i.kind === 'show');
    expect(episode?.art?.path).toBe('TV/The Wire/poster.jpg');
    // The key went only to TMDB, as a query parameter for a v3 key.
    const calls = vi.mocked(tmdb).mock.calls.map(([u]) => new URL(String(u)));
    expect(
      calls.every((u) => u.hostname === 'api.themoviedb.org' || u.hostname === 'image.tmdb.org'),
    ).toBe(true);
    expect(
      calls
        .filter((u) => u.hostname === 'image.tmdb.org')
        .every((u) => !u.search.includes('v3key')),
    ).toBe(true);

    const count = vi.mocked(tmdb).mock.calls.length;
    await lib.scan();
    expect(vi.mocked(tmdb).mock.calls.length).toBe(count); // asked once, not every scan
  });

  it('does nothing without a key', async () => {
    await seedLibrary();
    const lib = service({ online: createTmdbProvider(tmdb), readKey: async () => null });
    await lib.addRootPath(media);
    await lib.setSettings({ onlineMetadata: true });
    await lib.scan();
    expect(tmdb).not.toHaveBeenCalled();
    expect((await lib.getSettings()).onlineKeyAvailable).toBe(false);
  });

  it('sends a v4 token as a bearer header', async () => {
    const headers: unknown[] = [];
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      headers.push(init?.headers);
      expect(String(input)).not.toContain('api_key');
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }) as typeof fetch;
    expect(
      await createTmdbProvider(fetchFn).lookup(
        { kind: 'film', title: 'Up', year: 2009 },
        'eyJtoken',
      ),
    ).toBeNull();
    expect(headers[0]).toMatchObject({ Authorization: 'Bearer eyJtoken' });
  });
});

describe('serving files', () => {
  it('serves indexed paths through the jail, and nothing else', async () => {
    await seedLibrary();
    await writeFile(join(base, 'outside.txt'), 'secret');
    const lib = service();
    const added = await lib.addRootPath(media);
    if (!added.ok) throw new Error('add failed');
    const rootId = added.value.root.id;
    await lib.scan();

    const up = byTitle(await lib.items(), 'Up');
    expect(await resolveLibraryFileUrl(lib, libraryFileUrl({ rootId, path: up.path }))).toBe(
      join(media, up.path),
    );
    expect(
      await resolveLibraryFileUrl(
        lib,
        libraryFileUrl({ rootId, path: 'Films/Up (2009)/poster.jpg' }),
      ),
    ).toBe(join(media, 'Films/Up (2009)/poster.jpg'));
    const joga = byTitle(await lib.items(), 'Jóga');
    if (!joga.art) throw new Error('no art');
    expect(await resolveLibraryFileUrl(lib, libraryFileUrl(joga.art))).toBe(
      join(data, 'art', joga.art.path),
    );

    // Not indexed (the .nfo, a text file), out of the root, encoded traversal, unknown root, other host.
    expect(
      await resolveLibraryFileUrl(
        lib,
        libraryFileUrl({ rootId, path: 'Films/Up (2009)/Up (2009).nfo' }),
      ),
    ).toBeNull();
    expect(
      await resolveLibraryFileUrl(lib, libraryFileUrl({ rootId, path: 'Photos/Lisbon/notes.txt' })),
    ).toBeNull();
    expect(
      await resolveLibraryFileUrl(lib, `mstudio-file://library/${rootId}/..%2Foutside.txt`),
    ).toBeNull();
    expect(
      await resolveLibraryFileUrl(lib, `mstudio-file://library/${rootId}/../outside.txt`),
    ).toBeNull();
    expect(
      await resolveLibraryFileUrl(
        lib,
        `mstudio-file://library/rdeadbeef00/${encodeURIComponent('Up (2009).mkv')}`,
      ),
    ).toBeNull();
    expect(await resolveLibraryFileUrl(lib, `mstudio-file://repo/${rootId}/x`)).toBeNull();
    expect(await resolveLibraryFileUrl(lib, 'not a url')).toBeNull();
  });
});
