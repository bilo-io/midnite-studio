import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  EVENT_CHANNELS,
  failure,
  GAME_MANIFEST_FILE,
  ok,
  parseGameManifest,
  type BrowserBounds,
  type GameCreateRequest,
  type GameCreateResult,
  type GameLogEntry,
  type GameManifest,
  type GameManifestIssue,
  type GameSummary,
  type GamesSettings,
  type GamesSettingsPatch,
  type GamesSettingsRead,
  type GitOpResult,
} from '@midnite/studio-shared';

import type { Logger } from '../log';
import { listGames } from './game-list';
import { createGame } from './game-scaffold';
import type { GameRunner, ToolbarAction } from './game-runner';
import { effectiveGamesRoot, validateGamesRoot } from './games-root';
import type { GamesSettingsStore } from './games-settings-store';

export type GameServiceDeps = {
  settings: GamesSettingsStore;
  runner: GameRunner;
  /** `templates/media-game/`. */
  templateDir: string;
  /** Register a new repo with the app's repo list and reconcile its watchers. */
  registerRepo: (path: string) => Promise<GitOpResult>;
  /** Paths of every repo the app has registered. */
  listRepoPaths: () => Promise<string[]>;
  /** Push an event to the renderer(s). */
  send: (channel: string, payload: unknown) => void;
  log: Logger;
};

/**
 * The one implementation IPC (and, in a later theme, MCP) calls. Handlers are
 * thin adapters over it. Every op answers a `GitOpResult`; nothing throws.
 */
export function createGameService(deps: GameServiceDeps) {
  const read = async (): Promise<{ settings: GamesSettings; root: string }> => {
    const settings = await deps.settings.load();
    return { settings, root: effectiveGamesRoot(settings.gamesRoot) };
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

  return {
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

    async run(gameId: string): Promise<GitOpResult<{ runId: string }>> {
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
    logs: (gameId: string, since?: number): { runId: string | null; entries: GameLogEntry[] } =>
      deps.runner.logs(gameId, since),
    stopAll: (): void => deps.runner.stopAll(),
  };
}

export type GameService = ReturnType<typeof createGameService>;
