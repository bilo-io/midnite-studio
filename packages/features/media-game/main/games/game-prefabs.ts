import { randomBytes } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, posix, sep } from 'node:path';

import { execGit, writeQueue } from '@midnite/studio-git-engine';
import {
  EVENT_CHANNELS,
  failure,
  GAME_PREFAB_DIR,
  GAME_PREFAB_EXT,
  GAME_PREFAB_MAX_BYTES,
  GamePrefabNameSchema,
  GamePrefabSchema,
  ok,
  type GamePrefabGetResult,
  type GamePrefabListEntry,
  type GamePrefabsResult,
  type GamePrefabWriteResult,
  type GameSummary,
  type GitOpResult,
} from '@midnite/studio-shared';
import { joinWithin } from '@midnite/studio-runtime';

import type { Logger } from './logger';

/**
 * A game's prefabs (Phase 139 Theme F): `levels/prefabs/<name>.prefab.json`, one JSON per prefab, in the game's own
 * repo. Every op confines its paths to `<game>/levels/prefabs/`, answers a `GitOpResult` and never throws. A write
 * or delete goes through the per-repo write queue and is one commit naming only that file.
 */
export type GamePrefabsDeps = {
  resolve: (gameId: string) => Promise<GameSummary | null>;
  send: (channel: string, payload: unknown) => void;
  log: Logger;
};

const OUTSIDE = "That prefab is outside the game's prefabs folder.";
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function createGamePrefabs(deps: GamePrefabsDeps) {
  /** The path of `<game>/levels/prefabs/<name>.prefab.json`, confined, or the reason it is not. */
  async function prefabPath(game: GameSummary, name: string): Promise<GitOpResult<string>> {
    const parsed = GamePrefabNameSchema.safeParse(name);
    if (!parsed.success) return failure(`"${name}" is not a prefab name (${parsed.error.issues[0]?.message ?? 'invalid'}).`);
    const dir = joinWithin(game.path, GAME_PREFAB_DIR);
    const file = dir === null ? null : joinWithin(dir, `${parsed.data}${GAME_PREFAB_EXT}`);
    if (dir === null || file === null) return failure(OUTSIDE);
    // A prefabs folder (or `levels`) that is a symlink out of the game, or a prefab that is one, is not the game's own.
    try {
      const [realGame, realDir] = await Promise.all([realpath(game.path), realpath(dir)]);
      if (realDir !== join(realGame, ...GAME_PREFAB_DIR.split('/'))) return failure(OUTSIDE);
      if (!realDir.startsWith(realGame + sep)) return failure(OUTSIDE);
    } catch {
      // No prefabs folder yet: nothing to escape through.
    }
    try {
      if ((await lstat(file)).isSymbolicLink()) return failure(OUTSIDE);
    } catch {
      // Not there.
    }
    return ok(file);
  }

  async function list(gameId: string): Promise<GitOpResult<GamePrefabsResult>> {
    const game = await deps.resolve(gameId);
    if (!game) return failure('That game was not found.');
    let names: string[] = [];
    try {
      names = await readdir(join(game.path, GAME_PREFAB_DIR));
    } catch {
      names = [];
    }
    const prefabs: GamePrefabListEntry[] = [];
    for (const file of names) {
      if (!file.endsWith(GAME_PREFAB_EXT)) continue;
      const name = file.slice(0, -GAME_PREFAB_EXT.length);
      if (!GamePrefabNameSchema.safeParse(name).success) continue;
      const located = await prefabPath(game, name);
      if (!located.ok) continue;
      try {
        if ((await stat(located.value)).size > GAME_PREFAB_MAX_BYTES) {
          prefabs.push({ name, dimension: null, objects: 0, issue: `That prefab is over ${GAME_PREFAB_MAX_BYTES / 1024} KB.` });
          continue;
        }
        const parsed = GamePrefabSchema.safeParse(JSON.parse(await readFile(located.value, 'utf8')));
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          prefabs.push({ name, dimension: null, objects: 0, issue: first ? `${first.path.join('.') || '(root)'}: ${first.message}` : 'Not a valid prefab.' });
          continue;
        }
        const p = parsed.data;
        prefabs.push({ name, dimension: p.dimension, objects: p.objects.length, ...(p.description ? { description: p.description } : {}) });
      } catch (error) {
        prefabs.push({ name, dimension: null, objects: 0, issue: message(error) });
      }
    }
    prefabs.sort((a, b) => a.name.localeCompare(b.name));
    return ok({ prefabs });
  }

  async function get(gameId: string, name: string): Promise<GitOpResult<GamePrefabGetResult>> {
    const game = await deps.resolve(gameId);
    if (!game) return failure('That game was not found.');
    const located = await prefabPath(game, name);
    if (!located.ok) return located;
    let raw: string;
    try {
      if ((await stat(located.value)).size > GAME_PREFAB_MAX_BYTES) return failure(`That prefab is over ${GAME_PREFAB_MAX_BYTES / 1024} KB.`);
      raw = await readFile(located.value, 'utf8');
    } catch {
      return failure(`Prefab "${name}" not found in ${GAME_PREFAB_DIR}/.`);
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (error) {
      return failure(`Prefab "${name}" is not valid JSON: ${message(error)}`);
    }
    const parsed = GamePrefabSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return failure(`Prefab "${name}" is invalid: ${first ? `${first.path.join('.') || '(root)'}: ${first.message}` : 'unknown error'}`);
    }
    return ok({ prefab: parsed.data });
  }

  /** Stage `rel` and commit only it; `sha: null` when nothing changed. Runs inside the write queue. */
  async function commitOnly(game: GameSummary, rel: string, subject: string): Promise<GitOpResult<GamePrefabWriteResult>> {
    const added = await execGit(game.path, ['add', '-A', '--', rel], { write: true });
    if (added.exitCode !== 0) return failure(added.stderr.trim() || `Could not stage ${rel}.`);
    const quiet = await execGit(game.path, ['diff', '--cached', '--quiet', '--', rel]);
    if (quiet.exitCode === 0) return ok({ sha: null });
    // The pathspec keeps whatever else the user has staged or edited out of this commit.
    const committed = await execGit(game.path, ['commit', '--no-verify', '-m', subject, '--', rel], { write: true });
    if (committed.exitCode !== 0) return failure(committed.stderr.trim() || committed.stdout.trim() || `Could not commit ${rel}.`);
    const head = await execGit(game.path, ['rev-parse', 'HEAD']);
    return ok({ sha: head.exitCode === 0 ? head.stdout.trim() : null });
  }

  async function set(gameId: string, prefab: unknown): Promise<GitOpResult<GamePrefabWriteResult>> {
    const game = await deps.resolve(gameId);
    if (!game) return failure('That game was not found.');
    const parsed = GamePrefabSchema.safeParse(prefab);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return failure(first ? `${first.path.join('.') || '(root)'}: ${first.message}` : 'That is not a valid prefab.');
    }
    const { name } = parsed.data;
    const located = await prefabPath(game, name);
    if (!located.ok) return located;
    const text = `${JSON.stringify(parsed.data, null, 2)}\n`;
    if (Buffer.byteLength(text) > GAME_PREFAB_MAX_BYTES) return failure(`That prefab is over ${GAME_PREFAB_MAX_BYTES / 1024} KB.`);
    const rel = posix.join(GAME_PREFAB_DIR, `${name}${GAME_PREFAB_EXT}`);
    const file = located.value;

    const result = await writeQueue.run(game.path, async (): Promise<GitOpResult<GamePrefabWriteResult>> => {
      const temp = join(dirname(file), `.${name}.${randomBytes(4).toString('hex')}.tmp`);
      try {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(temp, text, 'utf8');
        await rename(temp, file);
      } catch (error) {
        await rm(temp, { force: true }).catch(() => undefined);
        return failure(`Could not write ${rel}: ${message(error)}`);
      }
      return commitOnly(game, rel, `Save prefab ${name}`);
    });
    if (result.ok) {
      deps.send(EVENT_CHANNELS.gamesChanged, { reason: 'level' });
      deps.log.info(`game prefab saved ${gameId} name=${name} sha=${result.value.sha ?? 'none'}`);
    }
    return result;
  }

  async function remove(gameId: string, name: string): Promise<GitOpResult<GamePrefabWriteResult>> {
    const game = await deps.resolve(gameId);
    if (!game) return failure('That game was not found.');
    const located = await prefabPath(game, name);
    if (!located.ok) return located;
    const rel = posix.join(GAME_PREFAB_DIR, `${name}${GAME_PREFAB_EXT}`);
    const result = await writeQueue.run(game.path, async (): Promise<GitOpResult<GamePrefabWriteResult>> => {
      if (!(await stat(located.value).then(() => true, () => false))) return failure(`Prefab "${name}" not found in ${GAME_PREFAB_DIR}/.`);
      try {
        await rm(located.value);
      } catch (error) {
        return failure(`Could not delete ${rel}: ${message(error)}`);
      }
      return commitOnly(game, rel, `Delete prefab ${name}`);
    });
    if (result.ok) {
      deps.send(EVENT_CHANNELS.gamesChanged, { reason: 'level' });
      deps.log.info(`game prefab deleted ${gameId} name=${name} sha=${result.value.sha ?? 'none'}`);
    }
    return result;
  }

  return { list, get, set, delete: remove };
}

export type GamePrefabs = ReturnType<typeof createGamePrefabs>;
