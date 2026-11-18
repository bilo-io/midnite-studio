import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  expandLibraryRoot,
  inferKind,
  isSafeRelativePath,
  listLibrary,
  parseCatalog,
  readLibraryFile,
  resolveInLibrary,
  walkCollection,
} from './asset-library';

const entry = (path: string, extra: Record<string, unknown> = {}) => ({
  path,
  category: 'models/vehicles',
  source: 'assets/model/x.glb',
  bytes: 10,
  sha256: 'abc',
  manifest: null,
  ...extra,
});

describe('parseCatalog', () => {
  it('reads the real {game, entries} shape and prefers the manifest name and kind', () => {
    const parsed = parseCatalog({
      game: 'GTACT',
      files: 2,
      entries: [entry('models/vehicles/ardente.glb', { manifest: { name: 'ardente', kind: 'model', studioSource: 's' } }), entry('meta/ASSETS.md')],
    });
    expect(parsed?.title).toBe('GTACT');
    expect(parsed?.assets).toHaveLength(2);
    expect(parsed?.assets[0]).toMatchObject({ name: 'ardente', kind: 'model', bytes: 10, sha256: 'abc' });
    expect(parsed?.assets[1]).toMatchObject({ name: 'ASSETS', kind: 'doc' });
  });

  it('accepts {files:[...]} and a bare array', () => {
    expect(parseCatalog({ files: [entry('a.png')] })?.assets[0]?.kind).toBe('image');
    expect(parseCatalog([entry('a.mp3')])?.assets[0]?.kind).toBe('audio');
  });

  it('drops malformed rows and rows that escape the collection', () => {
    const parsed = parseCatalog({ entries: [entry('../x.png'), entry('/abs.png'), entry('a/../b.png'), { nope: 1 }, 7, entry('ok.png')] });
    expect(parsed?.assets.map((a) => a.path)).toEqual(['ok.png']);
  });

  it('returns null when there is no entry list, and an unknown manifest kind falls back to the extension', () => {
    expect(parseCatalog({ game: 'x', files: 823 })).toBeNull();
    expect(parseCatalog('nope')).toBeNull();
    expect(parseCatalog([entry('a.glb', { manifest: { kind: 'weird' } })])?.assets[0]?.kind).toBe('model');
  });
});

describe('library on disk', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'asset-lib-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('infers kind from extension', () => {
    expect(inferKind('a/B.GLB')).toBe('model');
    expect(inferKind('x.woff2')).toBe('font');
    expect(inferKind('noext')).toBe('other');
  });

  it('walks a folder with no catalog, skipping dotfiles and the catalog files', async () => {
    await mkdir(join(root, 'pack/sfx'), { recursive: true });
    await writeFile(join(root, 'pack/sfx/boom.wav'), 'abcd');
    await writeFile(join(root, 'pack/hero.png'), 'x');
    await writeFile(join(root, 'pack/.hidden'), 'x');
    await writeFile(join(root, 'pack/CATALOG.md'), 'x');
    const assets = await walkCollection(join(root, 'pack'));
    expect(assets.map((a) => [a.path, a.category, a.kind, a.bytes])).toEqual([
      ['hero.png', '', 'image', 1],
      ['sfx/boom.wav', 'sfx', 'audio', 4],
    ]);
  });

  it('lists catalog collections, walk collections, and falls back with a warning on a broken catalog', async () => {
    await mkdir(join(root, 'gtact'));
    await writeFile(join(root, 'gtact/catalog.json'), JSON.stringify({ game: 'GTACT', entries: [entry('a.glb', { bytes: 5 })] }));
    await mkdir(join(root, 'loose'));
    await writeFile(join(root, 'loose/a.ogg'), 'zz');
    await mkdir(join(root, 'broken'));
    await writeFile(join(root, 'broken/catalog.json'), '{not json');
    await writeFile(join(root, 'broken/b.png'), 'q');
    await writeFile(join(root, 'stray-file.txt'), 'ignored');

    const listing = await listLibrary(root);
    expect(listing.exists).toBe(true);
    expect(listing.collections.map((c) => [c.id, c.origin])).toEqual([
      ['broken', 'walk'],
      ['gtact', 'catalog'],
      ['loose', 'walk'],
    ]);
    const gtact = listing.collections.find((c) => c.id === 'gtact');
    expect(gtact).toMatchObject({ title: 'GTACT', totalBytes: 5, warning: null });
    expect(listing.collections.find((c) => c.id === 'broken')?.warning).toMatch(/could not be read/);
  });

  it('a missing root is an empty listing, not an error', async () => {
    expect(await listLibrary(join(root, 'nope'))).toMatchObject({ exists: false, collections: [] });
  });

  describe('confinement', () => {
    beforeEach(async () => {
      await mkdir(join(root, 'lib/c'), { recursive: true });
      await writeFile(join(root, 'lib/c/a.png'), 'pngdata');
      await writeFile(join(root, 'secret.txt'), 'nope');
      await symlink(join(root, 'secret.txt'), join(root, 'lib/c/link.txt'));
    });

    it('rejects traversal, absolute paths and bad collection ids', async () => {
      const lib = join(root, 'lib');
      expect(await resolveInLibrary(lib, 'c', '../../secret.txt')).toBeNull();
      expect(await resolveInLibrary(lib, 'c', join(root, 'secret.txt'))).toBeNull();
      expect(await resolveInLibrary(lib, '..', 'secret.txt')).toBeNull();
      expect(await resolveInLibrary(lib, 'c/x', 'a.png')).toBeNull();
      expect(await resolveInLibrary(lib, 'c', 'missing.png')).toBeNull();
    });

    it('rejects a symlink that points outside the root, accepts a real file', async () => {
      const lib = join(root, 'lib');
      expect(await resolveInLibrary(lib, 'c', 'link.txt')).toBeNull();
      expect(await resolveInLibrary(lib, 'c', 'a.png')).toMatch(/c\/a\.png$/);
    });

    it('readLibraryFile inlines images and refuses escapes with an envelope', async () => {
      const lib = join(root, 'lib');
      const ok = await readLibraryFile(lib, 'c', 'a.png');
      expect(ok).toMatchObject({ ok: true, value: { mime: 'image/png', bytes: 7 } });
      expect(ok.ok && ok.value.dataUrl?.startsWith('data:image/png;base64,')).toBe(true);
      expect(await readLibraryFile(lib, 'c', '../../secret.txt')).toMatchObject({ ok: false, kind: 'error' });
    });
  });

  it('isSafeRelativePath and expandLibraryRoot', () => {
    expect(isSafeRelativePath('a/b.png')).toBe(true);
    expect(isSafeRelativePath('a//b')).toBe(false);
    expect(isSafeRelativePath('a\\b')).toBe(false);
    expect(expandLibraryRoot(null, '/home/u')).toBe('/home/u/GameDev/midnite-assets');
    expect(expandLibraryRoot('~/x', '/home/u')).toBe('/home/u/x');
    expect(expandLibraryRoot('/abs', '/home/u')).toBe('/abs');
  });
});
