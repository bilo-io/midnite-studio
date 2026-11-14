import { randomBytes } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, posix, sep } from 'node:path';

import { execGit, writeQueue } from '@midnite/studio-git-engine';
import {
  EVENT_CHANNELS,
  failure,
  GAME_LEVEL_EXT,
  GAME_LEVEL_IMAGES_MAX_BYTES,
  GAME_LEVEL_MAX_BYTES,
  GAME_LEVEL_MODEL_MAX_BYTES,
  GAME_LEVELS_DIR,
  GameSceneNameSchema,
  ok,
  parseGameLevel,
  type GameGotoResult,
  type GameLevelGetResult,
  type GameLevelModelResult,
  type GameLevelSetResult,
  type GameLevelsResult,
  type GameManifest,
  type GameManifestIssue,
  type GameSummary,
  type GitOpResult,
} from '@midnite/studio-shared';
import { confineToRoot, joinWithin } from '@midnite/studio-runtime';

import { readLevelTerrain } from './game-level-terrain';
import type { GameRunner } from './game-runner';
import type { Logger } from './logger';

/**
 * A game's levels (Phase 132 Theme C): `levels/<scene>.tmj`, one Tiled map per scene, in the game's own repo.
 * Every op confines its paths to `<game>/levels/`, answers a `GitOpResult` and never throws. A write is one file
 * and one commit naming only that file, so the user's other uncommitted work stays out of it.
 */
export type GameLevelsDeps = {
  /** A game by `gameId` (the game service's `resolve`). */
  resolve: (gameId: string) => Promise<GameSummary | null>;
  /** The game's manifest, or the issues that made it unreadable. */
  readManifest: (path: string) => Promise<{ manifest: GameManifest | null; issues: GameManifestIssue[] }>;
  runner: Pick<GameRunner, 'goto'>;
  send: (channel: string, payload: unknown) => void;
  log: Logger;
};

const OUTSIDE = "That level is outside the game's levels folder.";
const IMAGE_TYPES: Record<string, string> = { '.png': 'image/png', '.webp': 'image/webp' };

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function createGameLevels(deps: GameLevelsDeps) {
  /** The path of `<game>/levels/<scene>.tmj`, confined, or the reason it is not. */
  async function levelPath(game: GameSummary, scene: string): Promise<GitOpResult<string>> {
    const name = GameSceneNameSchema.safeParse(scene);
    if (!name.success) return failure(`"${scene}" is not a scene name (${name.error.issues[0]?.message ?? 'invalid'}).`);
    const dir = joinWithin(game.path, GAME_LEVELS_DIR);
    const file = dir === null ? null : joinWithin(dir, `${name.data}${GAME_LEVEL_EXT}`);
    if (dir === null || file === null) return failure(OUTSIDE);
    // A `levels` folder that is a symlink out of the game, or a level file that is one, is not the game's own.
    try {
      const [realGame, realDir] = await Promise.all([realpath(game.path), realpath(dir)]);
      if (realDir !== realGame && !realDir.startsWith(realGame + sep)) return failure(OUTSIDE);
      if (realDir !== join(realGame, GAME_LEVELS_DIR)) return failure(OUTSIDE);
    } catch {
      // No levels folder yet: nothing to escape through.
    }
    try {
      if ((await lstat(file)).isSymbolicLink()) return failure(OUTSIDE);
    } catch {
      // Not there.
    }
    return ok(file);
  }

  async function levels(gameId: string): Promise<GitOpResult<GameLevelsResult>> {
    const game = await deps.resolve(gameId);
    if (!game) return failure('That game was not found.');
    const { manifest } = await deps.readManifest(game.path);
    const start = manifest?.levels?.start ?? null;
    let names: string[] = [];
    try {
      names = await readdir(join(game.path, GAME_LEVELS_DIR));
    } catch {
      names = [];
    }
    const scenes: GameLevelsResult['scenes'] = [];
    for (const file of names) {
      if (extname(file) !== GAME_LEVEL_EXT) continue;
      const scene = file.slice(0, -GAME_LEVEL_EXT.length);
      if (!GameSceneNameSchema.safeParse(scene).success) continue;
      const located = await levelPath(game, scene);
      if (!located.ok) continue;
      try {
        const bytes = (await stat(located.value)).size;
        if (bytes > GAME_LEVEL_MAX_BYTES) {
          scenes.push({ scene, bytes, dimension: null, issue: `That level is over ${GAME_LEVEL_MAX_BYTES / 1048576} MB.` });
          continue;
        }
        const parsed = parseGameLevel(JSON.parse(await readFile(located.value, 'utf8')));
        scenes.push({ scene, bytes, dimension: parsed.ok ? parsed.dimension : null, issue: parsed.ok ? null : (parsed.issues[0]?.message ?? 'Not a valid level.') });
      } catch (error) {
        scenes.push({ scene, bytes: 0, dimension: null, issue: message(error) });
      }
    }
    scenes.sort((a, b) => (a.scene === start ? -1 : b.scene === start ? 1 : a.scene.localeCompare(b.scene)));
    return ok({ scenes, start, readsLevels: manifest?.levels !== undefined });
  }

  async function levelGet(gameId: string, scene: string): Promise<GitOpResult<GameLevelGetResult>> {
    const game = await deps.resolve(gameId);
    if (!game) return failure('That game was not found.');
    const located = await levelPath(game, scene);
    if (!located.ok) return located;
    let raw: string;
    try {
      const bytes = (await stat(located.value)).size;
      if (bytes > GAME_LEVEL_MAX_BYTES) return failure(`That level is over ${GAME_LEVEL_MAX_BYTES / 1048576} MB.`);
      raw = await readFile(located.value, 'utf8');
    } catch {
      return failure(`Level "${scene}" not found in ${GAME_LEVELS_DIR}/.`);
    }
    let level: unknown;
    try {
      level = JSON.parse(raw);
    } catch (error) {
      return ok({ level: null, issues: [{ path: '(root)', message: `Not valid JSON: ${message(error)}` }], images: [] });
    }
    const parsed = parseGameLevel(level);
    const issues: GameManifestIssue[] = parsed.ok ? [] : parsed.issues;
    const images: GameLevelGetResult['images'] = [];
    const tilesets = parsed.ok ? parsed.level.tilesets : [];
    let total = 0;
    let stopped = false;
    for (const tileset of tilesets) {
      const image = (tileset as { image?: unknown }).image;
      if (typeof image !== 'string' || stopped) continue;
      const mime = IMAGE_TYPES[extname(image).toLowerCase()];
      if (!mime) {
        issues.push({ path: `tilesets.${String(tileset.name ?? '')}.image`, message: `"${image}" is not a PNG or WebP image.` });
        continue;
      }
      // The image is relative to the .tmj, so it sits relative to `levels/`; it must still land inside the game.
      const real = await confineToRoot(game.path, posix.join(GAME_LEVELS_DIR, image.split('\\').join('/')));
      if (real === null) {
        issues.push({ path: `tilesets.${String(tileset.name ?? '')}.image`, message: `"${image}" is missing or outside the game folder.` });
        continue;
      }
      try {
        const bytes = (await stat(real)).size;
        if (total + bytes > GAME_LEVEL_IMAGES_MAX_BYTES) {
          issues.push({ path: `tilesets.${String(tileset.name ?? '')}.image`, message: `"${image}" and the images after it were skipped: a level's images are capped at ${GAME_LEVEL_IMAGES_MAX_BYTES / 1048576} MB.` });
          stopped = true;
          continue;
        }
        total += bytes;
        images.push({ path: image, dataUrl: `data:${mime};base64,${(await readFile(real)).toString('base64')}` });
      } catch {
        issues.push({ path: `tilesets.${String(tileset.name ?? '')}.image`, message: `"${image}" could not be read.` });
      }
    }
    const terrain = parsed.ok && parsed.dimension === '3d' ? await readLevelTerrain(game.path, parsed.level) : null;
    return ok({ level, issues, images, ...(terrain ? { terrain } : {}) });
  }

  async function levelSet(gameId: string, scene: string, level: unknown, opts: { create?: boolean } = {}): Promise<GitOpResult<GameLevelSetResult>> {
    const game = await deps.resolve(gameId);
    if (!game) return failure('That game was not found.');
    const located = await levelPath(game, scene);
    if (!located.ok) return located;
    const parsed = parseGameLevel(level);
    if (!parsed.ok) {
      const first = parsed.issues[0];
      return failure(first ? `${first.path}: ${first.message}` : 'That is not a valid level.');
    }
    const text = `${JSON.stringify(level, null, 2)}\n`;
    if (Buffer.byteLength(text) > GAME_LEVEL_MAX_BYTES) return failure(`That level is over ${GAME_LEVEL_MAX_BYTES / 1048576} MB.`);
    const rel = posix.join(GAME_LEVELS_DIR, `${scene}${GAME_LEVEL_EXT}`);
    const file = located.value;

    const result = await writeQueue.run(game.path, async (): Promise<GitOpResult<GameLevelSetResult>> => {
      const exists = await stat(file).then(() => true, () => false);
      if (opts.create === true && exists) return failure(`A scene named "${scene}" already exists.`);
      if (opts.create !== true && !exists) return failure(`Level "${scene}" not found in ${GAME_LEVELS_DIR}/.`);
      const temp = join(dirname(file), `.${scene}.${randomBytes(4).toString('hex')}.tmp`);
      try {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(temp, text, 'utf8');
        await rename(temp, file);
      } catch (error) {
        await rm(temp, { force: true }).catch(() => undefined);
        return failure(`Could not write ${rel}: ${message(error)}`);
      }
      const added = await execGit(game.path, ['add', '--', rel], { write: true });
      if (added.exitCode !== 0) return failure(added.stderr.trim() || `Could not stage ${rel}.`);
      // Unchanged content stages nothing: no commit.
      const quiet = await execGit(game.path, ['diff', '--cached', '--quiet', '--', rel]);
      if (quiet.exitCode === 0) return ok({ sha: null });
      // The pathspec keeps whatever else the user has staged or edited out of this commit.
      const committed = await execGit(
        game.path,
        ['commit', '--no-verify', '-m', `${opts.create === true ? 'Add' : 'Edit'} level ${scene}`, '--', rel],
        { write: true },
      );
      if (committed.exitCode !== 0) return failure(committed.stderr.trim() || committed.stdout.trim() || `Could not commit ${rel}.`);
      const head = await execGit(game.path, ['rev-parse', 'HEAD']);
      return ok({ sha: head.exitCode === 0 ? head.stdout.trim() : null });
    });
    if (result.ok) {
      deps.send(EVENT_CHANNELS.gamesChanged, { reason: 'level' });
      deps.log.info(`game level ${opts.create === true ? 'added' : 'saved'} ${gameId} scene=${scene} sha=${result.value.sha ?? 'none'}`);
    }
    return result;
  }

  async function goto(gameId: string, scene: string): Promise<GitOpResult<GameGotoResult>> {
    const game = await deps.resolve(gameId);
    if (!game) return failure('That game was not found.');
    const name = GameSceneNameSchema.safeParse(scene);
    if (!name.success) return failure(`"${scene}" is not a scene name (${name.error.issues[0]?.message ?? 'invalid'}).`);
    return deps.runner.goto(gameId, name.data);
  }

  /**
   * A `model` asset's `.glb` for the 3D view (Phase 136 Theme F): looked up by name in the manifest's assets,
   * confined to the game folder (a symlink out of it is refused), capped at {@link GAME_LEVEL_MODEL_MAX_BYTES}.
   */
  async function levelModel(gameId: string, name: string): Promise<GitOpResult<GameLevelModelResult>> {
    const game = await deps.resolve(gameId);
    if (!game) return failure('That game was not found.');
    const { manifest } = await deps.readManifest(game.path);
    const asset = manifest?.assets.find((a) => a.kind === 'model' && a.name === name);
    if (!asset) return failure(`No model asset named "${name}".`);
    if (extname(asset.path).toLowerCase() !== '.glb') return failure(`Model "${name}" is not a .glb file.`);
    const real = await confineToRoot(game.path, asset.path);
    if (real === null) return failure(`Model "${name}" is missing or outside the game folder.`);
    try {
      const bytes = (await stat(real)).size;
      if (bytes > GAME_LEVEL_MODEL_MAX_BYTES) return failure(`Model "${name}" is over ${GAME_LEVEL_MODEL_MAX_BYTES / 1048576} MB.`);
      return ok({ name, bytes, data: (await readFile(real)).toString('base64') });
    } catch (error) {
      return failure(`Model "${name}" could not be read: ${message(error)}`);
    }
  }

  return { list: levels, get: levelGet, set: levelSet, goto, model: levelModel };
}

export type GameLevels = ReturnType<typeof createGameLevels>;
