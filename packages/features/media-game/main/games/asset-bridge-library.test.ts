// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GameAssetIndexSchema, GameAssetProvenanceSchema, parseGameManifest, type GameSummary, type GitOpResult } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAssetBridge, type AssetGit } from './asset-bridge';

/** Importing from the shared asset library: copy, index entry, provenance, packs and refusals. Real temp dirs, fake git. */

const MANIFEST = {
  version: 1, name: 'Test Game', engine: 'three', dimension: '3d', perspective: 'third-person', genre: null, starter: 'blank', kitVersion: '0.7.0',
};
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

let work: string;
let lib: string;
let game: string;
let commits: { paths: string[]; message: string }[];

const git: AssetGit = {
  async changed() {
    return [];
  },
  async commitPaths(_p, paths, message): Promise<GitOpResult<{ sha: string }>> {
    commits.push({ paths, message });
    return { ok: true, value: { sha: `sha${commits.length}` } };
  },
};
const summary = (): GameSummary => ({ gameId: 'g1', name: 'Test Game', path: game, engine: 'three', dimension: '3d', starter: 'blank', dirty: false, valid: true, issue: null, status: null, findingCount: 0 });
const bridge = () =>
  createAssetBridge({
    resolve: async (id) => (id === 'g1' ? summary() : null),
    listRepoPaths: async () => [game],
    gamesRoot: async () => join(work, 'Games'),
    libraryRoot: async () => lib,
    git,
    send: () => undefined,
    log: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } as never,
  });
const readManifest = async () => JSON.parse(await readFile(join(game, 'midnite-game.json'), 'utf8'));
const readIndex = async () => JSON.parse(await readFile(join(game, 'assets/index.json'), 'utf8'));
const put = async (rel: string, data: string) => {
  await mkdir(join(lib, rel, '..'), { recursive: true });
  await writeFile(join(lib, rel), data);
};

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'asset-bridge-lib-'));
  lib = join(work, 'lib');
  game = join(work, 'Games', 'test-game');
  await mkdir(join(game, 'assets'), { recursive: true });
  await writeFile(join(game, 'midnite-game.json'), `${JSON.stringify(MANIFEST, null, 2)}\n`);
  await writeFile(join(game, 'assets/index.json'), '{ "version": 1, "assets": [] }\n');
  commits = [];
});
afterEach(async () => rm(work, { recursive: true, force: true }));

describe('library import: single files', () => {
  it('copies the file, registers it, records the library origin and commits once', async () => {
    await put('gtact/images/logo.png', 'PNGDATA');
    const res = await bridge().importLibrary({ gameId: 'g1', collection: 'gtact', path: 'images/logo.png' });
    expect(res).toMatchObject({ ok: true, value: { name: 'logo', kind: 'image', path: 'assets/image/logo.png', commit: 'sha1' } });
    expect(await readFile(join(game, 'assets/image/logo.png'), 'utf8')).toBe('PNGDATA');
    const origin = { library: 'gtact', path: 'images/logo.png', sha256: sha('PNGDATA') };
    expect((await readIndex()).assets).toEqual([{ name: 'logo', kind: 'image', path: 'assets/image/logo.png', library: origin }]);
    const recorded = parseGameManifest(await readManifest());
    expect(recorded.ok && recorded.manifest.assets[0]).toMatchObject({ name: 'logo', library: origin });
    expect(commits).toEqual([{ paths: ['assets/image/logo.png', 'assets/index.json', 'midnite-game.json'], message: 'assets: import logo' }]);
  });

  it('numbers a colliding name and honours an explicit one', async () => {
    await put('gtact/images/logo.png', 'A');
    await put('gtact/audio/logo.mp3', 'B');
    const b = bridge();
    await b.importLibrary({ gameId: 'g1', collection: 'gtact', path: 'images/logo.png' });
    const second = await b.importLibrary({ gameId: 'g1', collection: 'gtact', path: 'images/logo.png' });
    expect(second.ok && second.value.name).toBe('logo-2');
    const named = await b.importLibrary({ gameId: 'g1', collection: 'gtact', path: 'audio/logo.mp3', name: 'theme' });
    expect(named).toMatchObject({ ok: true, value: { name: 'theme', kind: 'audio', path: 'assets/audio/theme.mp3' } });
  });

  it('refuses kinds a game cannot hold, with a plain message', async () => {
    await put('gtact/reference/notes.md', '# hi');
    await put('gtact/fonts/a.ttf', 'x');
    await put('gtact/misc/blob.bin', 'x');
    await put('gtact/models/a.fbx', 'x');
    const b = bridge();
    for (const path of ['reference/notes.md', 'fonts/a.ttf', 'misc/blob.bin']) {
      const res = await b.importLibrary({ gameId: 'g1', collection: 'gtact', path });
      expect(res).toMatchObject({ ok: false, kind: 'error' });
      expect(!res.ok && res.kind === 'error' && res.message).toMatch(/cannot hold/);
    }
    const fbx = await b.importLibrary({ gameId: 'g1', collection: 'gtact', path: 'models/a.fbx' });
    expect(!fbx.ok && fbx.kind === 'error' && fbx.message).toMatch(/\.glb/);
    expect(commits).toEqual([]);
  });

  it('refuses paths that escape the library or a symlink pointing outside', async () => {
    await writeFile(join(work, 'secret.png'), 'S');
    await mkdir(join(lib, 'gtact'), { recursive: true });
    await symlink(join(work, 'secret.png'), join(lib, 'gtact', 'link.png'));
    const b = bridge();
    for (const [collection, path] of [['gtact', '../../secret.png'], ['..', 'x.png'], ['gtact', '/etc/hosts'], ['gtact', 'link.png'], ['gtact', 'missing.png']] as const) {
      expect(await b.importLibrary({ gameId: 'g1', collection, path })).toMatchObject({ ok: false });
    }
    expect(commits).toEqual([]);
  });

  it('fails plainly for an unknown game or no library', async () => {
    expect(await bridge().importLibrary({ gameId: 'nope', collection: 'gtact', path: 'a.png' })).toMatchObject({ ok: false });
    const noLib = createAssetBridge({ resolve: async () => summary(), listRepoPaths: async () => [], gamesRoot: async () => work, git, send: () => undefined, log: console as never });
    expect(await noLib.importLibrary({ gameId: 'g1', collection: 'gtact', path: 'a.png' })).toMatchObject({ ok: false });
  });
});

describe('library import: terrain packs', () => {
  async function seedPack() {
    await put('gtact/terrain/bay/terrain.manifest.json', '{"name":"bay"}');
    await put('gtact/terrain/bay/heightfield.bin', 'HEIGHT');
    await put('gtact/terrain/bay/drape/drape.png', 'DRAPE');
    await put('gtact/terrain/other/terrain.manifest.json', '{"name":"other"}');
  }

  it('imports the whole pack folder from any file in it, as one terrain asset', async () => {
    await seedPack();
    const res = await bridge().importLibrary({ gameId: 'g1', collection: 'gtact', path: 'terrain/bay/drape/drape.png' });
    expect(res).toMatchObject({ ok: true, value: { name: 'bay', kind: 'terrain', path: 'assets/terrain/bay', entry: 'terrain.manifest.json' } });
    expect((await stat(join(game, 'assets/terrain/bay/heightfield.bin'))).isFile()).toBe(true);
    expect(await readFile(join(game, 'assets/terrain/bay/drape/drape.png'), 'utf8')).toBe('DRAPE');
    await expect(stat(join(game, 'assets/terrain/other'))).rejects.toThrow();
    const entry = GameAssetIndexSchema.parse(await readIndex()).assets[0];
    expect(entry).toMatchObject({ name: 'bay', kind: 'terrain', entry: 'terrain.manifest.json', library: { library: 'gtact', path: 'terrain/bay' } });
    expect(entry?.library?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(commits).toHaveLength(1);
  });

  it('accepts the pack folder itself, and refuses a folder that is not a pack', async () => {
    await seedPack();
    await put('gtact/misc/readme.txt', 'x');
    const b = bridge();
    expect(await b.importLibrary({ gameId: 'g1', collection: 'gtact', path: 'terrain/bay' })).toMatchObject({ ok: true, value: { kind: 'terrain' } });
    expect(await b.importLibrary({ gameId: 'g1', collection: 'gtact', path: 'misc' })).toMatchObject({ ok: false });
  });

  it('re-sync sees a changed library pack', async () => {
    await seedPack();
    const b = bridge();
    await b.importLibrary({ gameId: 'g1', collection: 'gtact', path: 'terrain/bay/heightfield.bin' });
    expect(await b.resync({ gameId: 'g1', check: true })).toMatchObject({ ok: true, value: { changed: 0 } });
    await put('gtact/terrain/bay/heightfield.bin', 'HEIGHT2');
    expect(await b.resync({ gameId: 'g1', check: true })).toMatchObject({ ok: true, value: { changed: 1 } });
  });
});

describe('library provenance schema', () => {
  it('still parses an entry and a manifest asset written before the field existed', () => {
    expect(GameAssetIndexSchema.parse({ version: 1, assets: [{ name: 'a', kind: 'image', path: 'assets/image/a.png' }] }).assets[0]?.library).toBeUndefined();
    const legacy = { name: 'a', kind: 'image', path: 'assets/image/a.png', source: { tab: 'image', repoId: null, path: 'a.png' }, sha256: 'x', importedAt: 't' };
    expect(GameAssetProvenanceSchema.safeParse(legacy).success).toBe(true);
    expect(GameAssetProvenanceSchema.safeParse({ ...legacy, library: { library: 'gtact', path: 'a.png', sha256: 'x' } }).success).toBe(true);
    expect(GameAssetProvenanceSchema.safeParse({ ...legacy, library: { library: 'gtact' } }).success).toBe(false);
  });
});
