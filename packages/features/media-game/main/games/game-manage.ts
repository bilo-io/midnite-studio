import { lstat, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve as resolvePath } from 'node:path';

import { execGit, writeQueue } from '@midnite/studio-git-engine';
import {
  EVENT_CHANNELS,
  failure,
  GAME_MANIFEST_FILE,
  ok,
  parseGameManifest,
  type GameDeleteInfo,
  type GameSummary,
  type GitOpResult,
} from '@midnite/studio-shared';

import type { Logger } from './logger';

/** The size walk stops here: a game with `node_modules` is large, and the dialog only needs an order of magnitude. */
const SIZE_WALK_MAX_ENTRIES = 50_000;

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export type GameManageDeps = {
  resolve: (gameId: string) => Promise<GameSummary | null>;
  /** The effective games root: a game directly under it always lists, so it cannot be forgotten. */
  gamesRoot: () => Promise<string>;
  isRunning: (gameId: string) => boolean;
  stop: (gameId: string) => void;
  /** Take a repo out of the app's list (Studio: the repos panel; Gamer: `opened-games.json`). Absent → Remove is unavailable. */
  forgetRepo?: (path: string) => Promise<GitOpResult>;
  /** Put it back: delete rolls a forget back when the Trash refuses. */
  registerRepo: (path: string) => Promise<GitOpResult>;
  /** `shell.showItemInFolder`. Absent → Reveal is unavailable. */
  revealPath?: (path: string) => void;
  /** `shell.trashItem`. Absent → Delete is unavailable. Delete is always this, never `rm`. */
  trashPath?: (path: string) => Promise<GitOpResult>;
  send: (channel: string, payload: unknown) => void;
  log: Logger;
};

/** Total bytes under `root`, bounded; symlinks are counted as themselves and never followed. */
async function folderBytes(root: string): Promise<number> {
  let bytes = 0;
  let seen = 0;
  const pending = [root];
  while (pending.length > 0 && seen < SIZE_WALK_MAX_ENTRIES) {
    const dir = pending.pop() as string;
    let names: import('node:fs').Dirent[];
    try {
      names = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of names) {
      if (++seen > SIZE_WALK_MAX_ENTRIES) break;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else {
        try {
          bytes += (await lstat(full)).size;
        } catch {
          // vanished mid-walk
        }
      }
    }
  }
  return bytes;
}

/** Rename, reveal, forget and delete for one listed game (Phase 149 Theme I). Every op answers a `GitOpResult`. */
export function createGameManage(deps: GameManageDeps) {
  async function underGamesRoot(game: GameSummary): Promise<boolean> {
    const root = await deps.gamesRoot();
    const real = async (p: string): Promise<string> => realpath(p).catch(() => resolvePath(p));
    return (await real(dirname(game.path))) === (await real(root));
  }

  /** Forget without the lookup, shared by `forget` and `delete`. */
  async function forgetGame(game: GameSummary): Promise<GitOpResult> {
    if (await underGamesRoot(game)) {
      return failure('Games in the games folder always list — move or delete it to remove it.');
    }
    if (!deps.forgetRepo) return failure('Remove from list is not available here.');
    return deps.forgetRepo(game.path);
  }

  async function rename(gameId: string, rawName: string): Promise<GitOpResult> {
    const name = rawName.trim();
    if (name === '' || name.length > 80) return failure('A game name is 1 to 80 characters.');
    const game = await deps.resolve(gameId);
    if (!game) return failure('That game was not found.');
    return writeQueue.run(game.path, async (): Promise<GitOpResult> => {
      let current: Record<string, unknown>;
      try {
        current = JSON.parse(await readFile(join(game.path, GAME_MANIFEST_FILE), 'utf8')) as Record<string, unknown>;
      } catch (error) {
        return failure(`Could not read ${GAME_MANIFEST_FILE}: ${message(error)}`);
      }
      if (current.name === name) return ok();
      const next = { ...current, name };
      const parsed = parseGameManifest(next);
      if (!parsed.ok) {
        const first = parsed.issues[0];
        return failure(first ? `${first.path}: ${first.message}` : 'That would make the manifest invalid.');
      }
      try {
        await writeFile(join(game.path, GAME_MANIFEST_FILE), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
      } catch (error) {
        return failure(`Could not write ${GAME_MANIFEST_FILE}: ${message(error)}`);
      }
      const added = await execGit(game.path, ['add', '--', GAME_MANIFEST_FILE], { write: true });
      if (added.exitCode !== 0) return failure(added.stderr.trim() || `Could not stage ${GAME_MANIFEST_FILE}.`);
      // The pathspec keeps whatever else the user has staged or edited out of this commit.
      const committed = await execGit(
        game.path,
        ['commit', '--no-verify', '-m', `chore(midnite): rename to ${name}`, '--', GAME_MANIFEST_FILE],
        { write: true },
      );
      if (committed.exitCode !== 0) {
        return failure(committed.stderr.trim() || committed.stdout.trim() || `Could not commit ${GAME_MANIFEST_FILE}.`);
      }
      deps.send(EVENT_CHANNELS.gamesChanged, { reason: 'manifest' });
      deps.log.info(`game renamed ${gameId} name=${name}`);
      return ok();
    });
  }

  async function forget(gameId: string): Promise<GitOpResult> {
    const game = await deps.resolve(gameId);
    if (!game) return failure('That game was not found.');
    const result = await forgetGame(game);
    if (result.ok) {
      deps.send(EVENT_CHANNELS.gamesChanged, { reason: 'removed' });
      deps.log.info(`game forgotten ${gameId}`);
    }
    return result;
  }

  async function reveal(gameId: string): Promise<GitOpResult> {
    const game = await deps.resolve(gameId);
    if (!game) return failure('That game was not found.');
    if (!deps.revealPath) return failure('Reveal is not available here.');
    deps.revealPath(game.path);
    return ok();
  }

  async function deleteInfo(gameId: string): Promise<GitOpResult<GameDeleteInfo>> {
    const game = await deps.resolve(gameId);
    if (!game) return failure('That game was not found.');
    const status = await execGit(game.path, ['status', '--porcelain', '-z']);
    const uncommitted = status.exitCode === 0 ? status.stdout.split('\0').filter((entry) => entry !== '').length : 0;
    const remotes = await execGit(game.path, ['remote']);
    const hasRemote = remotes.exitCode === 0 && remotes.stdout.trim() !== '';
    // No upstream → the command fails → null: "nothing to compare to", not "nothing unpushed".
    const ahead = await execGit(game.path, ['rev-list', '--count', '@{u}..HEAD']);
    const unpushed = ahead.exitCode === 0 && /^\d+$/.test(ahead.stdout.trim()) ? Number(ahead.stdout.trim()) : null;
    return ok({ path: game.path, name: game.name, uncommitted, unpushed, hasRemote, bytes: await folderBytes(game.path) });
  }

  async function remove(gameId: string, confirmName: string): Promise<GitOpResult> {
    const game = await deps.resolve(gameId);
    if (!game) return failure('That game was not found.');
    if (confirmName !== game.name) return failure('The name did not match, so nothing was deleted.');
    if (!deps.trashPath) return failure('Delete is not available here.');
    if (deps.isRunning(game.gameId)) deps.stop(game.gameId);
    // Games in the games folder are found by scanning, so there is nothing to forget; one anywhere else leaves the list first.
    const inRoot = await underGamesRoot(game);
    let forgotten = false;
    if (!inRoot) {
      const result = await forgetGame(game);
      if (!result.ok) return result;
      forgotten = true;
    }
    const trashed = await deps.trashPath(game.path);
    if (!trashed.ok) {
      // The folder is still there, so put it back in the list.
      if (forgotten) await deps.registerRepo(game.path);
      return trashed;
    }
    deps.send(EVENT_CHANNELS.gamesChanged, { reason: 'removed' });
    deps.log.info(`game moved to the Trash ${game.gameId} path=${game.path}`);
    return ok();
  }

  return { rename, forget, reveal, deleteInfo, delete: remove };
}

export type GameManage = ReturnType<typeof createGameManage>;
