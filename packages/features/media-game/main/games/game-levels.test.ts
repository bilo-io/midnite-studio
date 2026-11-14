// @vitest-environment node
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { TempRepo } from '@midnite/studio-git-engine';
import { EVENT_CHANNELS, GAME_LEVEL_MAX_BYTES, GAME_MANIFEST_FILE, parseGameManifest, type GameSummary } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { createGameLevels } from './game-levels';

const tileset = { firstgid: 1, name: 'tiles', image: 'tiles.png', imagewidth: 64, imageheight: 32, tilewidth: 32, tileheight: 32, columns: 2, tilecount: 2, margin: 0, spacing: 0 };
const level = (over: Record<string, unknown> = {}) => ({
  type: 'map',
  orientation: 'orthogonal',
  infinite: false,
  width: 2,
  height: 1,
  tilewidth: 32,
  tileheight: 32,
  layers: [{ id: 1, type: 'tilelayer', name: 'ground', width: 2, height: 1, data: [1, 0] }],
  tilesets: [tileset],
  ...over,
});
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');

describe('createGameLevels (Phase 132 Theme C)', () => {
  let repo: TempRepo;
  let game: GameSummary;
  let send: Mock<(channel: string, payload: unknown) => void>;
  let goto: ReturnType<typeof vi.fn>;
  let levels: ReturnType<typeof createGameLevels>;

  const manifest = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({ version: 1, name: 'G', engine: 'phaser', dimension: '2d', perspective: 'platformer', genre: null, starter: 'blank', kitVersion: '0.12.0', ...extra });

  beforeEach(async () => {
    repo = await TempRepo.create();
    await repo.writeFile(GAME_MANIFEST_FILE, manifest({ levels: { start: 'level' } }));
    await repo.writeFile('src/main.js', 'console.log(1);');
    await repo.writeFile('levels/level.tmj', `${JSON.stringify(level(), null, 2)}\n`);
    await writeFile(join(repo.path, 'levels', 'tiles.png'), PNG);
    await repo.git(['add', '.']);
    await repo.git(['commit', '-m', 'Initial commit']);
    game = { gameId: 'g1', name: 'G', path: repo.path, engine: 'phaser', dimension: '2d', starter: 'blank', dirty: false, valid: true, issue: null };
    send = vi.fn<(channel: string, payload: unknown) => void>();
    goto = vi.fn(async () => ({ ok: true, value: { via: 'hook' } }));
    levels = createGameLevels({
      resolve: async (id) => (id === 'g1' ? game : null),
      readManifest: async (path) => {
        const parsed = parseGameManifest(JSON.parse(await readFile(join(path, GAME_MANIFEST_FILE), 'utf8')));
        return parsed.ok ? { manifest: parsed.manifest, issues: [] } : { manifest: null, issues: parsed.issues };
      },
      runner: { goto } as never,
      send,
      log: Object.assign(vi.fn(), { info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    });
  });
  afterEach(async () => {
    await repo.cleanup();
  });

  const log = async () => (await repo.git(['log', '--format=%s'])).trim().split('\n');

  describe('list', () => {
    it('lists scenes with the start scene first, their dimension and any issue', async () => {
      await repo.writeFile('levels/cave.tmj', JSON.stringify(level({ properties: [{ name: 'midnite.dimension', type: 'string', value: '3d' }] })));
      await repo.writeFile('levels/aaa.tmj', JSON.stringify(level({ infinite: true })));
      await repo.writeFile('levels/Bad Name.tmj', '{}');
      await repo.writeFile('levels/notes.txt', 'x');
      await repo.writeFile('levels/broken.tmj', '{nope');
      const result = await levels.list('g1');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.start).toBe('level');
      expect(result.value.readsLevels).toBe(true);
      expect(result.value.scenes.map((s) => s.scene)).toEqual(['level', 'aaa', 'broken', 'cave']);
      expect(result.value.scenes[0]).toMatchObject({ scene: 'level', dimension: '2d', issue: null });
      expect(result.value.scenes[1]!.issue).toContain('Infinite maps are not supported');
      expect(result.value.scenes[2]!.issue).toBeTruthy();
      expect(result.value.scenes[3]).toMatchObject({ dimension: '3d', issue: null });
    });

    it('is empty with no levels folder, and says the game does not read levels without the manifest key', async () => {
      await repo.writeFile(GAME_MANIFEST_FILE, manifest());
      await repo.git(['rm', '-rq', 'levels']);
      const result = await levels.list('g1');
      expect(result).toEqual({ ok: true, value: { scenes: [], start: null, readsLevels: false } });
      expect(await levels.list('nope')).toMatchObject({ ok: false });
    });
  });

  describe('get', () => {
    it('answers the raw level, no issues, and the embedded tileset image as a data URL', async () => {
      const result = await levels.get('g1', 'level');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.issues).toEqual([]);
      expect(result.value.level).toMatchObject({ type: 'map' });
      expect(result.value.images).toEqual([{ path: 'tiles.png', dataUrl: `data:image/png;base64,${PNG.toString('base64')}` }]);
    });

    it('confines images to the game folder and to png/webp', async () => {
      await repo.writeFile('levels/esc.tmj', JSON.stringify(level({ tilesets: [{ ...tileset, image: '../../outside.png' }, { ...tileset, name: 'b', image: 'a.gif' }] })));
      const result = await levels.get('g1', 'esc');
      expect(result.ok && result.value.images).toEqual([]);
      expect(result.ok && result.value.issues.map((i) => i.message)).toEqual([
        '"../../outside.png" is missing or outside the game folder.',
        '"a.gif" is not a PNG or WebP image.',
      ]);
    });

    it('refuses an image that links out of the game', async () => {
      await symlink('/etc/hosts', join(repo.path, 'levels', 'link.png'));
      await repo.writeFile('levels/lnk.tmj', JSON.stringify(level({ tilesets: [{ ...tileset, image: 'link.png' }] })));
      const result = await levels.get('g1', 'lnk');
      expect(result.ok && result.value.images).toEqual([]);
    });

    it('stops at the images byte cap with an issue naming the first one skipped', async () => {
      const big = Buffer.alloc(5 * 1024 * 1024, 1);
      await writeFile(join(repo.path, 'levels', 'a.png'), big);
      await writeFile(join(repo.path, 'levels', 'b.png'), big);
      await repo.writeFile('levels/big.tmj', JSON.stringify(level({ tilesets: [{ ...tileset, name: 'a', image: 'a.png' }, { ...tileset, name: 'b', image: 'b.png' }] })));
      const result = await levels.get('g1', 'big');
      expect(result.ok && result.value.images.map((i) => i.path)).toEqual(['a.png']);
      expect(result.ok && result.value.issues[0]?.message).toContain('"b.png"');
    });

    it('reports invalid JSON as an issue, a missing level and a bad scene as failures', async () => {
      await repo.writeFile('levels/junk.tmj', '{nope');
      const junk = await levels.get('g1', 'junk');
      expect(junk.ok && junk.value.issues[0]?.message).toContain('Not valid JSON');
      expect(await levels.get('g1', 'missing')).toMatchObject({ ok: false, message: 'Level "missing" not found in levels/.' });
      expect(await levels.get('g1', '../x')).toMatchObject({ ok: false });
    });
  });

  describe('set', () => {
    it('writes the file and commits only it, leaving other uncommitted work alone', async () => {
      await repo.writeFile('src/main.js', 'console.log("dirty");');
      await repo.git(['add', 'src/main.js']); // even a staged change stays out of the level commit
      const next = level({ width: 3 });
      const result = await levels.set('g1', 'level', next);
      expect(result.ok && result.value.sha).toMatch(/^[0-9a-f]{40}$/);
      expect((await log())[0]).toBe('Edit level level');
      expect((await repo.git(['show', '--name-only', '--format=', 'HEAD'])).trim()).toBe('levels/level.tmj');
      expect((await repo.git(['status', '--porcelain'])).trim()).toBe('M  src/main.js');
      const text = await readFile(join(repo.path, 'levels', 'level.tmj'), 'utf8');
      expect(text.endsWith('}\n')).toBe(true);
      expect(JSON.parse(text).width).toBe(3);
      expect(send).toHaveBeenCalledWith(EVENT_CHANNELS.gamesChanged, { reason: 'level' });
    });

    it('makes no commit when the content is unchanged', async () => {
      const before = (await log()).length;
      const result = await levels.set('g1', 'level', level());
      expect(result).toEqual({ ok: true, value: { sha: null } });
      expect((await log()).length).toBe(before);
    });

    it('create adds a level and refuses an existing one; without create a missing one is refused', async () => {
      const made = await levels.set('g1', 'cave', level(), { create: true });
      expect(made.ok).toBe(true);
      expect((await log())[0]).toBe('Add level cave');
      expect(await levels.set('g1', 'cave', level(), { create: true })).toMatchObject({ ok: false, message: 'A scene named "cave" already exists.' });
      expect(await levels.set('g1', 'nope', level())).toMatchObject({ ok: false, message: 'Level "nope" not found in levels/.' });
    });

    it('refuses a path outside levels/, an invalid level and an oversized one', async () => {
      for (const bad of ['../x', '..', 'a/b', 'Cave', '']) expect(await levels.set('g1', bad, level(), { create: true })).toMatchObject({ ok: false });
      expect(await levels.set('g1', 'level', level({ infinite: true }))).toMatchObject({ ok: false });
      const huge = level({ properties: [{ name: 'x', type: 'string', value: 'y'.repeat(GAME_LEVEL_MAX_BYTES) }] });
      expect(await levels.set('g1', 'level', huge)).toMatchObject({ ok: false });
      expect((await log())).toEqual(['Initial commit']);
    });

    it('refuses a level file that is a symlink out of the game', async () => {
      await symlink('/tmp', join(repo.path, 'levels', 'out.tmj'));
      expect(await levels.set('g1', 'out', level())).toMatchObject({ ok: false, message: "That level is outside the game's levels folder." });
    });

    it('refuses a levels folder that is a symlink out of the game', async () => {
      await repo.git(['rm', '-rq', 'levels']);
      await symlink(join(repo.path, '..'), join(repo.path, 'levels'));
      expect(await levels.set('g1', 'x', level(), { create: true })).toMatchObject({ ok: false, message: "That level is outside the game's levels folder." });
    });
  });

  describe('mapAsset', () => {
    it('reads a valid map asset TMJ from assets/map/<name>/map.tmj', async () => {
      await repo.writeFile('assets/map/Cave_1/map.tmj', JSON.stringify(level()));
      const result = await levels.mapAsset('g1', 'Cave_1');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.issues).toEqual([]);
      expect(result.value.level).toMatchObject({ type: 'map', width: 2, height: 1 });
    });

    it('reports issues when map.tmj is invalid JSON or invalid level', async () => {
      await repo.writeFile('assets/map/bad-json/map.tmj', '{nope');
      const r1 = await levels.mapAsset('g1', 'bad-json');
      expect(r1.ok).toBe(true);
      if (r1.ok) {
        expect(r1.value.level).toBeNull();
        expect(r1.value.issues[0]?.message).toContain('Not valid JSON');
      }

      await repo.writeFile('assets/map/inf/map.tmj', JSON.stringify(level({ infinite: true })));
      const r2 = await levels.mapAsset('g1', 'inf');
      expect(r2.ok).toBe(true);
      if (r2.ok) expect(r2.value.issues[0]?.message).toContain('Infinite maps are not supported');
    });

    it('refuses path traversal, missing assets, symlinks out of the game and oversized files', async () => {
      for (const bad of ['../levels', '..', 'a/b', '.hidden', '']) {
        expect(await levels.mapAsset('g1', bad)).toMatchObject({ ok: false });
      }
      expect(await levels.mapAsset('nope', 'cave')).toMatchObject({ ok: false });
      expect(await levels.mapAsset('g1', 'missing')).toMatchObject({ ok: false });

      await mkdir(join(repo.path, 'assets', 'map', 'linked'), { recursive: true });
      await symlink('/etc/hosts', join(repo.path, 'assets', 'map', 'linked', 'map.tmj'));
      expect(await levels.mapAsset('g1', 'linked')).toMatchObject({ ok: false });

      const huge = level({ properties: [{ name: 'x', type: 'string', value: 'y'.repeat(GAME_LEVEL_MAX_BYTES) }] });
      await repo.writeFile('assets/map/huge/map.tmj', JSON.stringify(huge));
      expect(await levels.mapAsset('g1', 'huge')).toMatchObject({ ok: false });
    });
  });

  describe('goto', () => {
    it('validates the scene then asks the runner', async () => {
      expect(await levels.goto('g1', 'cave')).toEqual({ ok: true, value: { via: 'hook' } });
      expect(goto).toHaveBeenCalledWith('g1', 'cave');
      expect(await levels.goto('g1', '../x')).toMatchObject({ ok: false });
      expect(await levels.goto('nope', 'cave')).toMatchObject({ ok: false });
      expect(goto).toHaveBeenCalledTimes(1);
    });
  });
});
