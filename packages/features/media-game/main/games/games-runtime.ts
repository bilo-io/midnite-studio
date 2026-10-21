import type { GitOpResult } from '@midnite/studio-shared';

import { createAssetBridge, type AssetBridge, type ExportTerrain } from './asset-bridge';
import type { GameElectron, GamePopoutWindow, GameView, GameWindow } from './game-electron';
import { createGameExport, type GameExport } from './game-export';
import { createGamePopout, type GamePopout } from './game-popout';
import { createGameRunner, type GameRunner } from './game-runner';
import { createGameService, type GameService } from './game-service';
import { createGamesSettingsStore } from './games-settings-store';
import type { Logger } from './logger';

/**
 * Everything the games feature's main half needs from the app that composes it (Phase 113 Theme S) — the
 * Electron pieces behind narrow ports, the app's repo registry, and where the template and the vendored
 * engines live. Nothing here is imported from `electron`: Studio's desktop and Gamer's main each hand in
 * their own, so the whole half runs under bare vitest.
 */
export type GamesRuntimeDeps<V extends GameView = GameView> = {
  /** The app's userData: `games-settings.json` lives here. */
  userData: string;
  /** Where games live until the user picks a folder (default `~/Midnite Games`). */
  defaultGamesRoot?: string;
  log: Logger;
  /** Push an event to every window. */
  send: (channel: string, payload: unknown) => void;
  /** The window a run's view attaches to. */
  getWindow: () => GameWindow | null;
  /** Electron's `session` and `WebContentsView`, `net.fetch` and the download refusal. */
  electron: GameElectron<V>;
  /** Create (or focus) the `game` role window a popout lives in. Absent → no Pop out. */
  openPopoutWindow?: () => GamePopoutWindow;
  /** `templates/media-game/` — packaged or in the tree. */
  templateDir: string;
  /** The vendored engine files (`resources/game-engines/`). */
  enginesDir: string;
  /** Register a new repo with the app's repo list and reconcile its watchers. */
  registerRepo: (path: string) => Promise<GitOpResult>;
  /** Paths of every repo the app has registered. */
  listRepoPaths: () => Promise<string[]>;
  /** Maps a registered repo path to its id, for an asset's provenance. */
  repoIdOf?: (repoPath: string) => Promise<string | null>;
  /** The Terrain feature's `exportTerrain`, for importing a terrain pack as a game asset. Absent → that import fails plainly. */
  exportTerrain?: ExportTerrain;
};

export type GamesRuntime<V extends GameView = GameView> = {
  runner: GameRunner<V>;
  popout: GamePopout | undefined;
  service: GameService;
  assets: AssetBridge;
  exporter: GameExport;
  /** Stops every run — called once on quit, which closes the view and the process of each. */
  stopAll(): void;
};

/** The one wiring of the games' services, shared by Studio's desktop and Gamer — what `main/index.ts` did inline. */
export function createGamesRuntime<V extends GameView = GameView>(deps: GamesRuntimeDeps<V>): GamesRuntime<V> {
  const runner = createGameRunner<V>({ getWindow: deps.getWindow, electron: deps.electron, log: deps.log, send: deps.send });
  const popout = deps.openPopoutWindow
    ? createGamePopout({ runner, openWindow: deps.openPopoutWindow, send: deps.send, log: deps.log })
    : undefined;
  const service = createGameService({
    settings: createGamesSettingsStore(deps.userData),
    ...(deps.defaultGamesRoot ? { defaultRoot: deps.defaultGamesRoot } : {}),
    runner,
    templateDir: deps.templateDir,
    enginesDir: deps.enginesDir,
    registerRepo: deps.registerRepo,
    listRepoPaths: deps.listRepoPaths,
    send: deps.send,
    log: deps.log,
    popout,
  });
  // The asset bridge (Theme N): copies media into a game's assets/, one commit per import.
  const assets = createAssetBridge({
    resolve: (gameId) => service.resolve(gameId),
    listRepoPaths: deps.listRepoPaths,
    gamesRoot: async () => (await service.settings.get()).resolvedRoot,
    ...(deps.repoIdOf ? { repoIdOf: deps.repoIdOf } : {}),
    ...(deps.exportTerrain ? { exportTerrain: deps.exportTerrain } : {}),
    send: deps.send,
    log: deps.log,
  });
  const exporter = createGameExport({ resolve: (gameId) => service.resolve(gameId) });
  return { runner, popout, service, assets, exporter, stopAll: () => service.stopAll() };
}
