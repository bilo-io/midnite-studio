import { readFile, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve as resolvePath } from 'node:path';

import {
  EVENT_CHANNELS,
  failure,
  GAME_MANIFEST_FILE,
  ok,
  parseGameManifest,
  type BrowserBounds,
  type GameAddResult,
  type GameCreateRequest,
  type GameCreateResult,
  type GameJuicePatch,
  type GameJuiceSettings,
  type GameLogEntry,
  type GameManifest,
  type GameManifestIssue,
  type GamePoppedResponse,
  type GameSummary,
  type GamesSettings,
  type GamesSettingsPatch,
  type GamesSettingsRead,
  type GitOpResult,
} from '@midnite/studio-shared';

import type { Logger } from './logger';
import { resolveGameFolder } from './game-open';
import { listGames } from './game-list';
import { createGameLevels } from './game-levels';
import { createGame, gameIdForPath } from './game-scaffold';
import type { GamePopout } from './game-popout';
import type { GameRunner, ToolbarAction } from './game-runner';
import { effectiveGamesRoot, validateGamesRoot } from './games-root';
import type { GamesSettingsStore } from './games-settings-store';
import { upgradeKit } from './kit-upgrade';

export type GameServiceDeps = {
  settings: GamesSettingsStore;
  runner: GameRunner;
  /** `templates/media-game/`. */
  templateDir: string;
  /** `resources/game-engines/`. */
  enginesDir: string;
  /** Register a new repo with the app's repo list and reconcile its watchers. */
  registerRepo: (path: string) => Promise<GitOpResult>;
  /** Paths of every repo the app has registered. */
  listRepoPaths: () => Promise<string[]>;
  /** The Open Game folder dialog, owned by the host's main process: an absolute path, or null when dismissed. */
  pickFolder?: () => Promise<string | null>;
  /** Push an event to the renderer(s). */
  send: (channel: string, payload: unknown) => void;
  log: Logger;
  /** Pop out (Theme B). Absent in tests that never pop a game out. */
  popout?: GamePopout;
  /** Where games live until the user picks a folder. Defaults to `~/Midnite Games`; a smoke run points it at its userData. */
  defaultRoot?: string;
};

/**
 * The one implementation IPC (and, in a later theme, MCP) calls. Handlers are
 * thin adapters over it. Every op answers a `GitOpResult`; nothing throws.
 */
export function createGameService(deps: GameServiceDeps) {
  const read = async (): Promise<{ settings: GamesSettings; root: string }> => {
    const settings = await deps.settings.load();
    return { settings, root: effectiveGamesRoot(settings.gamesRoot, deps.defaultRoot) };
  };

  async function settingsRead(): Promise<GamesSettingsRead> {
    const { settings, root } = await read();
    return { settings, resolvedRoot: root, rootProblem: await validateGamesRoot(root) };
  }

  /** Find a listed game by id. */
  async function find(gameId: string): Promise<GameSummary | null> {
    const { root } = await read();
    const games = await listGames(root, await deps.listRepoPaths());
    return games.find((game) => game.gameId === gameId) ?? null;
  }

  async function readManifest(path: string): Promise<{ manifest: GameManifest | null; issues: GameManifestIssue[] }> {
    let value: unknown;
    try {
      value = JSON.parse(await readFile(join(path, GAME_MANIFEST_FILE), 'utf8'));
    } catch (error) {
      return { manifest: null, issues: [{ path: '(root)', message: error instanceof Error ? error.message : String(error) }] };
    }
    const parsed = parseGameManifest(value);
    return parsed.ok ? { manifest: parsed.manifest, issues: [] } : { manifest: null, issues: parsed.issues };
  }

  /**
   * A game by `gameId` or absolute path (the MCP addressing). A path outside the
   * games location that is not a registered repo is not a game: it never reaches
   * the filesystem beyond the listing.
   */
  async function resolve(target: string): Promise<GameSummary | null> {
    const { root } = await read();
    const games = await listGames(root, await deps.listRepoPaths());
    if (!isAbsolute(target)) return games.find((game) => game.gameId === target) ?? null;
    const wanted = resolvePath(target);
    return games.find((game) => resolvePath(game.path) === wanted) ?? null;
  }

  const levels = createGameLevels({ resolve, readManifest, runner: deps.runner, send: deps.send, log: deps.log });

  return {
    resolve,
    view: (gameId: string) => deps.runner.view(gameId),
    isRunning: (gameId: string): boolean => deps.runner.isRunning(gameId),
    emit: (channel: string, payload: unknown): void => deps.send(channel, payload),

    settings: {
      get: settingsRead,

      async set(patch: GamesSettingsPatch): Promise<GitOpResult<GamesSettingsRead>> {
        const current = await deps.settings.load();
        const next: GamesSettings = { ...current, ...patch, version: 1 };
        if (typeof next.gamesRoot === 'string') {
          const problem = await validateGamesRoot(next.gamesRoot);
          if (problem !== null) return failure(problem);
        }
        await deps.settings.save(next);
        return ok(await settingsRead());
      },
    },

    async list(): Promise<GameSummary[]> {
      const { root } = await read();
      return listGames(root, await deps.listRepoPaths());
    },

    async create(req: GameCreateRequest): Promise<GitOpResult<GameCreateResult>> {
      const { settings, root } = await read();
      const result = await createGame(req, {
        templateDir: deps.templateDir,
        enginesDir: deps.enginesDir,
        gamesRoot: root,
        defaultNetwork: settings.defaultNetwork,
        registerRepo: deps.registerRepo,
      });
      if (result.ok) {
        deps.send(EVENT_CHANNELS.gamesChanged, { reason: 'created' });
        deps.log.info(`game created ${result.value.gameId} path=${result.value.path}`);
      }
      return result;
    },

    /**
     * Open Game (Phase 132 Theme A): add an existing game folder to the list. `path` absent shows the host's
     * folder dialog. A game already listed answers `listed` and nothing is written.
     */
    async add(path?: string): Promise<GitOpResult<GameAddResult>> {
      let picked = path;
      if (picked === undefined) {
        if (!deps.pickFolder) return failure('Open Game is not available here.');
        const answer = await deps.pickFolder();
        if (answer === null) return ok({ status: 'cancelled' });
        picked = answer;
      }
      const resolved = await resolveGameFolder(picked);
      if (!resolved.ok) return resolved;
      const { root } = resolved.value;
      const { root: gamesRoot } = await read();
      const real = await realpath(root).catch(() => root);
      const games = await listGames(gamesRoot, await deps.listRepoPaths());
      for (const game of games) {
        if ((await realpath(game.path).catch(() => game.path)) === real) {
          return ok({ status: 'listed', gameId: game.gameId, path: game.path });
        }
      }
      const registered = await deps.registerRepo(root);
      if (!registered.ok) return registered;
      deps.send(EVENT_CHANNELS.gamesChanged, { reason: 'added' });
      const gameId = await gameIdForPath(root);
      deps.log.info(`game added ${gameId} path=${root}`);
      return ok({ status: 'added', gameId, path: root });
    },

    async manifestGet(gameId: string): Promise<{ manifest: GameManifest | null; issues: GameManifestIssue[] }> {
      const game = await find(gameId);
      if (!game) return { manifest: null, issues: [{ path: '(root)', message: 'That game was not found.' }] };
      return readManifest(game.path);
    },

    async manifestSet(gameId: string, patch: Record<string, unknown>): Promise<GitOpResult> {
      const game = await find(gameId);
      if (!game) return failure('That game was not found.');
      let current: Record<string, unknown>;
      try {
        current = JSON.parse(await readFile(join(game.path, GAME_MANIFEST_FILE), 'utf8')) as Record<string, unknown>;
      } catch (error) {
        return failure(`Could not read ${GAME_MANIFEST_FILE}: ${error instanceof Error ? error.message : String(error)}`);
      }
      const merged = { ...current, ...patch };
      const parsed = parseGameManifest(merged);
      if (!parsed.ok) {
        const first = parsed.issues[0];
        return failure(first ? `${first.path}: ${first.message}` : 'That would make the manifest invalid.');
      }
      try {
        await writeFile(join(game.path, GAME_MANIFEST_FILE), `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
      } catch (error) {
        return failure(`Could not write ${GAME_MANIFEST_FILE}: ${error instanceof Error ? error.message : String(error)}`);
      }
      deps.send(EVENT_CHANNELS.gamesChanged, { reason: 'manifest' });
      return ok();
    },

    /**
     * Run a game. A manifest with `deterministic: true` runs deterministically (seed 1);
     * `opts.determinism` forces it for this run — what a play-test does.
     */
    async run(gameId: string, opts: { determinism?: { seed: number; paused: boolean } } = {}): Promise<GitOpResult<{ runId: string }>> {
      const game = await find(gameId);
      if (!game) return failure('That game was not found.');
      const { manifest, issues } = await readManifest(game.path);
      if (!manifest) {
        const first = issues[0];
        return failure(`${GAME_MANIFEST_FILE} is invalid${first ? ` (${first.path}: ${first.message})` : ''}.`);
      }
      return deps.runner.run({
        gameId,
        root: game.path,
        network: manifest.network,
        keepSaveData: manifest.keepSaveData,
        determinism: opts.determinism ?? (manifest.deterministic ? { seed: 1, paused: false } : null),
      });
    },

    stop(gameId: string): GitOpResult {
      deps.runner.stop(gameId);
      return ok();
    },
    reload: (gameId: string): GitOpResult => deps.runner.reload(gameId),
    setBounds: (gameId: string, bounds: BrowserBounds): void => deps.runner.setBounds(gameId, bounds),
    setVisible: (gameId: string, visible: boolean): void => deps.runner.setVisible(gameId, visible),
    toolbar: (gameId: string, action: ToolbarAction, value?: string | number | boolean): Promise<GitOpResult> =>
      deps.runner.toolbar(gameId, action, value),
    juice: (gameId: string, action: 'get' | 'set' | 'reset', patch?: GameJuicePatch): Promise<GitOpResult<GameJuiceSettings>> =>
      deps.runner.juice(gameId, action, patch),
    logs: (gameId: string, since?: number): { runId: string | null; entries: GameLogEntry[] } =>
      deps.runner.logs(gameId, since),
    /** `levels/<scene>.tmj` (Phase 132 Theme C): list, read, write-and-commit; and the jump to a scene. */
    levels: { list: levels.list, get: levels.get, set: levels.set, model: levels.model },
    goto: levels.goto,
    async kitUpgrade(gameId: string): Promise<GitOpResult<{ branch: string }>> {
      const game = await find(gameId);
      if (!game) return failure('That game was not found.');
      const result = await upgradeKit(game.path, {
        templateDir: deps.templateDir,
        enginesDir: deps.enginesDir,
        onBranchOpened: () => {
          deps.send(EVENT_CHANNELS.gamesChanged, { reason: 'manifest' });
        },
      });
      if (result.ok) {
        deps.log.info(`game kit upgraded ${gameId} branch=${result.value.branch}`);
      }
      return result;
    },
    stopAll: (): void => deps.runner.stopAll(),

    async popOut(gameId: string): Promise<GitOpResult> {
      if (!deps.popout) return failure('Pop out is not available.');
      if (!(await find(gameId))) return failure('That game was not found.');
      return deps.popout.popOut(gameId);
    },
    popped: (): GamePoppedResponse => deps.popout?.popped() ?? { gameId: null, run: null },
  };
}

export type GameService = ReturnType<typeof createGameService>;
