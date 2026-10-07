import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  GameAssetIndexSchema,
  parseGameManifest,
  type GameSummary,
  type GitOpResult,
} from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAssetBridge, detectEntry, hashAsset, suggestAssetName, type AssetGit } from './asset-bridge';

/**
 * The asset bridge (Phase 107 Theme N): copies, provenance, the index, re-sync and the commits.
 * Real files in temp dirs; git is a fake that records what it was asked to commit.
 */

const fixturePack = resolve(__dirname, '__fixtures__/terrain-pack');
const coreDir = resolve(__dirname, '../../../../../templates/media-game/kit/core');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JS module
const loadKit = async (file: string): Promise<any> => import(pathToFileURL(join(coreDir, file)).href);

const MANIFEST = {
  version: 1,
  name: 'Test Game',
  engine: 'three',
  dimension: '3d',
  perspective: 'third-person',
  genre: null,
  starter: 'blank',
  kitVersion: '0.7.0',
};

let work: string;
let repo: string; // a registered repo holding media
let game: string; // the game repo
let commits: { paths: string[]; message: string }[];
let changed: { path: string; staged: boolean }[];
let clock = 0;

const git: AssetGit = {
  async changed() {
    return changed;
  },
  async commitPaths(_path, paths, message): Promise<GitOpResult<{ sha: string }>> {
    commits.push({ paths, message });
    return { ok: true, value: { sha: `sha${commits.length}` } };
  },
};

const summary = (): GameSummary => ({
  gameId: 'g1',
  name: 'Test Game',
  path: game,
  engine: 'three',
  dimension: '3d',
  starter: 'blank',
  dirty: false,
  valid: true,
  issue: null,
});

const bridge = (overrides: Partial<Parameters<typeof createAssetBridge>[0]> = {}) =>
  createAssetBridge({
    resolve: async (id) => (id === 'g1' ? summary() : null),
    listRepoPaths: async () => [repo, game],
    gamesRoot: async () => join(work, 'Games'),
    git,
    now: () => new Date(Date.UTC(2026, 9, 7, 12, 0, clock++)),
    send: () => undefined,
    log: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } as never,
    exportTerrainPack: async (dir, dest) => {
      const pack = join(dest, 'dunes.terrain');
      await cp(fixturePack, pack, { recursive: true });
      await writeFile(join(pack, 'source-dir.txt'), dir);
      return { ok: true, value: { path: pack } };
    },
    ...overrides,
  });

const readManifest = async () => JSON.parse(await readFile(join(game, 'midnite-game.json'), 'utf8'));
const readIndex = async () => JSON.parse(await readFile(join(game, 'assets/index.json'), 'utf8'));
const media = (tab: string, ...rest: string[]) => join(repo, '.midnite/media', tab, ...rest);

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'asset-bridge-'));
  repo = join(work, 'repo');
  game = join(work, 'Games', 'test-game');
  await mkdir(repo, { recursive: true });
  await mkdir(join(game, 'assets'), { recursive: true });
  await writeFile(join(game, 'midnite-game.json'), `${JSON.stringify(MANIFEST, null, 2)}\n`);
  await writeFile(join(game, 'assets/index.json'), '{ "version": 1, "assets": [] }\n');
  commits = [];
  changed = [];
  clock = 0;
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

async function seedSprite(group = 'characters', asset = 'hero-20261007-120000'): Promise<string> {
  const dir = media('sprite', group, asset);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'sprite.json'), '{}');
  await writeFile(join(dir, 'atlas.json'), JSON.stringify({ frames: {} }));
  await writeFile(
    join(dir, 'anims.json'),
    JSON.stringify({ anims: [{ key: 'hero/walk/e' }, { key: 'hero/walk/w' }, { key: 'hero/idle' }] }),
  );
  await writeFile(join(dir, 'atlas.png'), 'png-bytes');
  return dir;
}

describe('suggestAssetName', () => {
  it('drops the pack suffix and file extension and keeps the name legal', () => {
    expect(suggestAssetName('dunes.terrain')).toBe('dunes');
    expect(suggestAssetName('hero-20261007-120000')).toBe('hero-20261007-120000');
    expect(suggestAssetName('My Shot (1).PNG')).toBe('My-Shot-1-');
    expect(suggestAssetName('...')).toBe('asset');
  });
});

describe('importing a single file', () => {
  it('copies an image, records provenance, registers it and commits it on its own', async () => {
    await mkdir(media('image', 'shots'), { recursive: true });
    await writeFile(media('image', 'shots', 'logo.png'), 'PNGDATA');

    const result = await bridge().importAsset({ gameId: 'g1', source: { tab: 'image', repoPath: repo, path: 'shots/logo.png' } });
    expect(result).toMatchObject({ ok: true, value: { name: 'logo', kind: 'image', path: 'assets/image/logo.png', commit: 'sha1' } });

    // A copy, not a link.
    const copy = join(game, 'assets/image/logo.png');
    expect(await readFile(copy, 'utf8')).toBe('PNGDATA');
    expect((await stat(copy)).isSymbolicLink()).toBe(false);

    const index = GameAssetIndexSchema.parse(await readIndex());
    expect(index.assets).toEqual([{ name: 'logo', kind: 'image', path: 'assets/image/logo.png' }]);

    const manifest = parseGameManifest(await readManifest());
    expect(manifest.ok).toBe(true);
    const [provenance] = manifest.ok ? manifest.manifest.assets : [];
    expect(provenance).toMatchObject({
      name: 'logo',
      kind: 'image',
      path: 'assets/image/logo.png',
      source: { tab: 'image', path: 'shots/logo.png' },
    });
    // The hash is of the file's bytes.
    expect(provenance?.sha256).toBe((await hashAsset(copy, false) as { ok: true; value: { sha256: string } }).value.sha256);
    expect(provenance?.importedAt).toBe('2026-10-07T12:00:00.000Z');

    expect(commits).toEqual([
      { paths: ['assets/image/logo.png', 'assets/index.json', 'midnite-game.json'], message: 'assets: import logo' },
    ]);
  });

  it('suffixes a name that is taken, across kinds', async () => {
    await mkdir(media('image'), { recursive: true });
    await writeFile(media('image', 'hero.png'), 'a');
    await mkdir(media('audio'), { recursive: true });
    await writeFile(media('audio', 'hero.mp3'), 'b');
    const b = bridge();
    const first = await b.importAsset({ gameId: 'g1', source: { tab: 'image', repoPath: repo, path: 'hero.png' } });
    const second = await b.importAsset({ gameId: 'g1', source: { tab: 'audio', repoPath: repo, path: 'hero.mp3' } });
    expect(first).toMatchObject({ ok: true, value: { name: 'hero' } });
    expect(second).toMatchObject({ ok: true, value: { name: 'hero-2', path: 'assets/audio/hero-2.mp3' } });
  });

  it('refuses a wrong extension, a missing item and an unregistered repo', async () => {
    await mkdir(media('model'), { recursive: true });
    await writeFile(media('model', 'rock.fbx'), 'x');
    const b = bridge();
    expect(await b.importAsset({ gameId: 'g1', source: { tab: 'model', repoPath: repo, path: 'rock.fbx' } })).toMatchObject({ ok: false });
    expect(await b.importAsset({ gameId: 'g1', source: { tab: 'model', repoPath: repo, path: 'nope.glb' } })).toMatchObject({ ok: false });
    expect(await b.importAsset({ gameId: 'g1', source: { tab: 'model', repoPath: work, path: 'rock.glb' } })).toMatchObject({
      ok: false,
      message: 'That repository is not registered with the app.',
    });
    expect(commits).toEqual([]);
  });

  it('does not follow a symlink out of the media folder', async () => {
    await mkdir(media('image'), { recursive: true });
    await writeFile(join(work, 'secret.png'), 'secret');
    await symlink(join(work, 'secret.png'), media('image', 'link.png'));
    const result = await bridge().importAsset({ gameId: 'g1', source: { tab: 'image', repoPath: repo, path: 'link.png' } });
    expect(result).toMatchObject({ ok: false, message: 'That item is not in the repo’s media.' });
  });

  it('refuses while the manifest or index holds uncommitted edits, or something else is staged', async () => {
    await mkdir(media('image'), { recursive: true });
    await writeFile(media('image', 'a.png'), 'a');
    const req = { gameId: 'g1', source: { tab: 'image' as const, repoPath: repo, path: 'a.png' } };
    changed = [{ path: 'midnite-game.json', staged: false }];
    expect(await bridge().importAsset(req)).toMatchObject({ ok: false });
    changed = [{ path: 'src/main.js', staged: true }];
    expect(await bridge().importAsset(req)).toMatchObject({ ok: false });
    changed = [{ path: 'src/main.js', staged: false }];
    expect(await bridge().importAsset(req)).toMatchObject({ ok: true });
  });
});

describe('importing folders', () => {
  it('imports a Phase 105 pack folder and the kit loader accepts the copy', async () => {
    // The fixture pack must sit under a registered repo or the games location.
    const pack = join(repo, 'packs', 'fixture.terrain');
    await cp(fixturePack, pack, { recursive: true });
    const imported = await bridge().importAsset({ gameId: 'g1', source: { packPath: pack }, name: 'world' });
    expect(imported).toMatchObject({
      ok: true,
      value: { name: 'world', kind: 'terrain', path: 'assets/terrain/world', entry: 'terrain.manifest.json' },
    });

    const manifestJson = JSON.parse(await readFile(join(game, 'assets/terrain/world/terrain.manifest.json'), 'utf8'));
    const { parseTerrainManifest } = await loadKit('terrain-manifest.js');
    expect(parseTerrainManifest(manifestJson).ok).toBe(true);

    // The index gives the kit the entry by name.
    const { createAssetIndex } = await loadKit('asset-index.js');
    expect(createAssetIndex(await readIndex()).assetUrl('world')).toBe('./assets/terrain/world/terrain.manifest.json');
    expect(commits.at(-1)?.message).toBe('assets: import world');
  });

  it('refuses a pack outside any registered repo or the games location, and a folder that is no pack', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'asset-bridge-out-'));
    try {
      await cp(fixturePack, join(outside, 'x.terrain'), { recursive: true });
      const refused = await bridge().importAsset({ gameId: 'g1', source: { packPath: join(outside, 'x.terrain') } });
      expect(refused).toMatchObject({ ok: false, message: 'Packs can only be imported from a registered repo or the games location.' });
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
    await mkdir(join(repo, 'plain'), { recursive: true });
    await writeFile(join(repo, 'plain', 'a.txt'), 'x');
    expect(await bridge().importAsset({ gameId: 'g1', source: { packPath: join(repo, 'plain') } })).toMatchObject({ ok: false });
  });

  it('imports a sprite asset with its group as kind, and its anims.json keys resolve through animName', async () => {
    await seedSprite('tilesets', 'grass-1');
    await seedSprite('characters', 'hero-20261007-120000');
    const b = bridge();
    const tileset = await b.importAsset({ gameId: 'g1', source: { tab: 'sprite', repoPath: repo, path: 'tilesets/grass-1' } });
    expect(tileset).toMatchObject({ ok: true, value: { kind: 'tileset', path: 'assets/tileset/grass-1' } });
    const hero = await b.importAsset({ gameId: 'g1', source: { tab: 'sprite', repoPath: repo, path: 'characters/hero-20261007-120000' }, name: 'hero' });
    expect(hero).toMatchObject({ ok: true, value: { kind: 'sprite', entry: 'atlas.json' } });

    const anims = JSON.parse(await readFile(join(game, 'assets/sprite/hero/anims.json'), 'utf8'));
    const { animName, animKeysFromJSON } = await loadKit('anim-names.js');
    expect(animName('hero', 'walk', [1, 0], animKeysFromJSON(anims))).toBe('hero/walk/e');
    expect(animName('hero', 'idle', [0, 1], animKeysFromJSON(anims))).toBe('hero/idle');
  });

  it('exports a terrain from the media store on the way in, and hashes the source folder', async () => {
    const dir = media('terrain', 'terrains', 'dunes-20261007-120000');
    await mkdir(join(dir, 'build'), { recursive: true });
    await writeFile(join(dir, 'terrain.json'), '{}');
    await writeFile(join(dir, 'build', 'heights.bin'), 'h');
    const result = await bridge().importAsset({
      gameId: 'g1',
      source: { tab: 'terrain', repoPath: repo, path: 'terrains/dunes-20261007-120000' },
      name: 'dunes',
    });
    expect(result).toMatchObject({ ok: true, value: { kind: 'terrain', path: 'assets/terrain/dunes', entry: 'terrain.manifest.json' } });
    // The scratch export directory is gone and was told the real source folder.
    expect(await readFile(join(game, 'assets/terrain/dunes/source-dir.txt'), 'utf8')).toContain('dunes-20261007-120000');
    const manifest = parseGameManifest(await readManifest());
    const rec = manifest.ok ? manifest.manifest.assets[0] : undefined;
    expect(rec?.sourceSha256).toBeTruthy();
    expect(rec?.sourceSha256).not.toBe(rec?.sha256);
  });
});

describe('listing sources', () => {
  it('lists built terrains, sprite assets by group and files by tab, per registered repo', async () => {
    await mkdir(join(media('terrain', 'terrains', 'built'), 'build'), { recursive: true });
    await writeFile(media('terrain', 'terrains', 'built', 'terrain.json'), '{}');
    await mkdir(media('terrain', 'terrains', 'unbuilt'), { recursive: true });
    await writeFile(media('terrain', 'terrains', 'unbuilt', 'terrain.json'), '{}');
    await seedSprite('maps', 'level-1');
    await mkdir(media('image', 'a'), { recursive: true });
    await writeFile(media('image', 'a', 'x.png'), 'xx');
    await writeFile(media('image', 'a', 'notes.txt'), 'xx');

    const b = bridge();
    expect((await b.sources('terrain')).repos).toEqual([
      { repoPath: await realRepo(), name: 'repo', items: [{ path: 'terrains/built', label: 'built', kind: 'terrain', bytes: 0 }] },
    ]);
    expect((await b.sources('sprite')).repos[0]?.items).toEqual([{ path: 'maps/level-1', label: 'level-1', kind: 'map', bytes: 0 }]);
    expect((await b.sources('image')).repos[0]?.items).toEqual([{ path: 'a/x.png', label: 'a/x.png', kind: 'image', bytes: 2 }]);
    expect((await b.sources('audio')).repos).toEqual([]);
  });
});

async function realRepo(): Promise<string> {
  const { realpath } = await import('node:fs/promises');
  return realpath(repo);
}

describe('re-sync', () => {
  async function importedHero(): Promise<ReturnType<typeof bridge>> {
    const dir = await seedSprite();
    expect(dir).toBeTruthy();
    const b = bridge();
    await b.importAsset({ gameId: 'g1', source: { tab: 'sprite', repoPath: repo, path: 'characters/hero-20261007-120000' }, name: 'hero' });
    await mkdir(media('image'), { recursive: true });
    await writeFile(media('image', 'logo.png'), 'v1');
    await b.importAsset({ gameId: 'g1', source: { tab: 'image', repoPath: repo, path: 'logo.png' } });
    commits = [];
    return b;
  }

  it('reports a changed source without touching the game', async () => {
    const b = await importedHero();
    expect(await b.resync({ gameId: 'g1', check: true })).toMatchObject({ ok: true, value: { changed: 0 } });

    await writeFile(media('image', 'logo.png'), 'v2');
    const before = await readFile(join(game, 'assets/image/logo.png'), 'utf8');
    const checked = await b.resync({ gameId: 'g1', check: true });
    expect(checked).toMatchObject({ ok: true, value: { changed: 1, reimported: [], commit: null } });
    expect(checked.ok && checked.value.assets.map((a) => [a.name, a.state])).toEqual([
      ['hero', 'current'],
      ['logo', 'changed'],
    ]);
    expect(await readFile(join(game, 'assets/image/logo.png'), 'utf8')).toBe(before);
    expect(commits).toEqual([]);
  });

  it('re-imports only what changed, as its own commit, updating hash and time', async () => {
    const b = await importedHero();
    const was = parseGameManifest(await readManifest());
    const wasLogo = was.ok ? was.manifest.assets.find((a) => a.name === 'logo') : undefined;

    await writeFile(media('image', 'logo.png'), 'v2');
    const done = await b.resync({ gameId: 'g1' });
    expect(done).toMatchObject({ ok: true, value: { reimported: ['logo'], commit: 'sha1', changed: 0 } });
    expect(await readFile(join(game, 'assets/image/logo.png'), 'utf8')).toBe('v2');
    expect(commits).toEqual([
      { paths: ['assets/image/logo.png', 'assets/index.json', 'midnite-game.json'], message: 'assets: re-import logo' },
    ]);

    const now = parseGameManifest(await readManifest());
    const nowLogo = now.ok ? now.manifest.assets.find((a) => a.name === 'logo') : undefined;
    expect(nowLogo?.sha256).not.toBe(wasLogo?.sha256);
    expect(nowLogo?.importedAt).not.toBe(wasLogo?.importedAt);
    // Nothing is duplicated.
    expect((await readIndex()).assets).toHaveLength(2);
    expect(await b.resync({ gameId: 'g1', check: true })).toMatchObject({ ok: true, value: { changed: 0 } });
  });

  it('re-imports a folder asset and removes files the source dropped', async () => {
    const b = await importedHero();
    const dir = media('sprite', 'characters', 'hero-20261007-120000');
    await rm(join(dir, 'atlas.png'));
    await writeFile(join(dir, 'extra.json'), '{}');
    expect(await b.resync({ gameId: 'g1', names: ['hero'] })).toMatchObject({ ok: true, value: { reimported: ['hero'] } });
    expect((await readdir(join(game, 'assets/sprite/hero'))).sort()).toEqual(['anims.json', 'atlas.json', 'extra.json', 'sprite.json']);
    expect(commits[0]?.message).toBe('assets: re-import hero');
  });

  it('reports a missing source and never deletes the copy', async () => {
    const b = await importedHero();
    await rm(media('image', 'logo.png'));
    const result = await b.resync({ gameId: 'g1' });
    expect(result).toMatchObject({ ok: true, value: { reimported: [], commit: null } });
    expect(result.ok && result.value.assets.find((a) => a.name === 'logo')?.state).toBe('missing');
    expect(await readFile(join(game, 'assets/image/logo.png'), 'utf8')).toBe('v1');
    expect(commits).toEqual([]);
  });
});

describe('helpers', () => {
  it('hashes a folder over its sorted path and content list, ignoring symlinks', async () => {
    const a = join(work, 'a');
    const c = join(work, 'c');
    await mkdir(join(a, 'sub'), { recursive: true });
    await mkdir(join(c, 'sub'), { recursive: true });
    await writeFile(join(a, 'x.txt'), '1');
    await writeFile(join(a, 'sub/y.txt'), '2');
    await writeFile(join(c, 'sub/y.txt'), '2');
    await writeFile(join(c, 'x.txt'), '1');
    await symlink(join(a, 'x.txt'), join(c, 'link'));
    const ha = await hashAsset(a, true);
    const hc = await hashAsset(c, true);
    expect(ha.ok && hc.ok && ha.value.sha256 === hc.value.sha256).toBe(true);
    await writeFile(join(c, 'x.txt'), '3');
    const hd = await hashAsset(c, true);
    expect(hd.ok && ha.ok && hd.value.sha256 !== ha.value.sha256).toBe(true);
  });

  it('finds a folder asset’s entry file', async () => {
    const d = join(work, 'e');
    await mkdir(d);
    expect(await detectEntry(d)).toBeUndefined();
    await writeFile(join(d, 'level.tmj'), '{}');
    expect(await detectEntry(d)).toBe('level.tmj');
    await writeFile(join(d, 'atlas.json'), '{}');
    expect(await detectEntry(d)).toBe('atlas.json');
  });
});
