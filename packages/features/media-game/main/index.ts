import { defineFeatureMain } from '@midnite/studio-runtime';
import {
  CHANNELS,
  failure,
  gameSlug,
  MEDIA_EXPORT_FORMAT_INFO,
  ok,
  schemas,
  type GameAgentRunRequest,
  type GameAgentRunResult,
  type GamePlaytestEntry,
  type GamePlaytestResult,
  type GitOpResult,
} from '@midnite/studio-shared';

import { mediaGameManifest } from '../manifest';
import type { GamesRuntime } from './games/games-runtime';
import type { Logger } from './games/logger';

export { mediaGameManifest, type MediaGameManifest } from '../manifest';
export { createGamesRuntime, type GamesRuntime, type GamesRuntimeDeps } from './games/games-runtime';
export type { Logger } from './games/logger';
export type {
  GameDownloadItem,
  GameElectron,
  GameListener,
  GamePopoutWindow,
  GameSession,
  GameView,
  GameViewOptions,
  GameWebContents,
  GameWindow,
} from './games/game-electron';
export type { GameFileFetch } from './games/game-protocol';
export { createGameService, type GameService, type GameServiceDeps } from './games/game-service';
export { createGameRunner, gameEntryUrl, type GameRunner, type GameRunnerDeps, type RunnableGame, type ToolbarAction } from './games/game-runner';
export { createGamePopout, type GamePopout } from './games/game-popout';
export { createAssetBridge, type AssetBridge, type ExportTerrain } from './games/asset-bridge';
export { createGameExport, type GameExport } from './games/game-export';
export { createGamesSettingsStore, type GamesSettingsStore } from './games/games-settings-store';
export { listGames } from './games/game-list';
export { effectiveGamesRoot } from './games/games-root';

/**
 * Create and iterate (Theme M): an agent edits a game repo in passes, one commit per changing pass. The
 * runner needs the Model tab's iterative agent harness and the MCP server, which stay in the desktop for
 * now (Phase 113 Theme S slice 2/3), so the feature takes it as a port — Studio passes the real service,
 * an app without agents passes nothing and the three channels answer "not available".
 */
export type GameAgentsPort = {
  run(req: GameAgentRunRequest): Promise<GitOpResult<GameAgentRunResult>>;
  cancel(gameId: string): GitOpResult | Promise<GitOpResult>;
  undo(gameId: string, sha: string): Promise<GitOpResult>;
};

/** Play-tests (Theme O): the toolbar's Playtests menu. Same story as the agents — the kit hook runs in the desktop's `playtest.ts`. */
export type GamePlaytestsPort = {
  list(gameId: string): Promise<GamePlaytestEntry[]>;
  run(gameId: string, opts: { names?: readonly string[] }): Promise<{ passed: boolean; runs: GamePlaytestResult[] }>;
};

export type MediaGameMainServices = {
  runtime: Pick<GamesRuntime, 'service' | 'assets' | 'exporter'>;
  log: Logger;
  /** The native "Save as" for a single-file web export — absolute path, or null when dismissed. Main's, never the renderer's. */
  pickSavePath: (options: { defaultPath: string; filters: { name: string; extensions: string[] }[] }) => Promise<string | null>;
  agents?: GameAgentsPort;
  playtests?: GamePlaytestsPort;
};

const AGENTS_UNAVAILABLE = 'Agents are not available in this app.';
const PLAYTESTS_UNAVAILABLE = 'Play-tests are not available in this app.';

/**
 * The games feature's main half (Phase 113 Theme S): `mstudio:games:*` — thin adapters over one
 * `GameService`. `setBounds`/`setVisible` are one-way like `apps.setBounds`: a bounds push fires every
 * resize frame and a round trip would only add latency. `games-runtime.ts` wires the services.
 */
export const mediaGameMain = defineFeatureMain<MediaGameMainServices>({
  feature: mediaGameManifest.feature,
  channels: mediaGameManifest.ipc,
  register(ctx, { runtime, log, pickSavePath, agents, playtests }) {
    const { handle, handleBare, send } = ctx.ipc;
    const { service, assets, exporter } = runtime;
    const warnInvalid = (issue: string): void => {
      log.warn(issue);
    };

    handleBare(CHANNELS.gamesSettingsGet, () => service.settings.get());
    handle(CHANNELS.gamesSettingsSet, schemas.GamesSettingsSetRequest, (patch) => service.settings.set(patch), (issue) => failure(issue));
    handleBare(CHANNELS.gamesList, async () => ({ games: await service.list() }));
    handle(CHANNELS.gamesCreate, schemas.GamesCreateRequest, (req) => service.create(req), (issue) => failure(issue));
    handle(
      CHANNELS.gamesGetManifest,
      schemas.GamesGetManifestRequest,
      ({ gameId }) => service.manifestGet(gameId),
      (issue) => ({ manifest: null, issues: [{ path: '(root)', message: issue }] }),
    );
    handle(
      CHANNELS.gamesSetManifest,
      schemas.GamesSetManifestRequest,
      ({ gameId, patch }) => service.manifestSet(gameId, patch),
      (issue) => failure(issue),
    );
    handle(CHANNELS.gamesRun, schemas.GamesRunRequest, ({ gameId }) => service.run(gameId), (issue) => failure(issue));
    handle(CHANNELS.gamesStop, schemas.GamesStopRequest, ({ gameId }) => service.stop(gameId), (issue) => failure(issue));
    handle(CHANNELS.gamesReload, schemas.GamesReloadRequest, ({ gameId }) => service.reload(gameId), (issue) => failure(issue));

    send(CHANNELS.gamesSetBounds, schemas.GamesSetBoundsRequest, ({ gameId, bounds }) => service.setBounds(gameId, bounds), warnInvalid);
    send(CHANNELS.gamesSetVisible, schemas.GamesSetVisibleRequest, ({ gameId, visible }) => service.setVisible(gameId, visible), warnInvalid);

    handle(
      CHANNELS.gamesToolbar,
      schemas.GamesToolbarRequest,
      ({ gameId, action, value }) => service.toolbar(gameId, action, value),
      (issue) => failure(issue),
    );
    handle(
      CHANNELS.gamesJuice,
      schemas.GamesJuiceRequest,
      ({ gameId, action, patch }) => service.juice(gameId, action, patch),
      (issue) => failure(issue),
    );
    handle(
      CHANNELS.gamesLogs,
      schemas.GamesLogsRequest,
      ({ gameId, since }) => service.logs(gameId, since),
      () => ({ runId: null, entries: [] }),
    );
    handle(CHANNELS.gamesPopOut, schemas.GamesPopOutRequest, ({ gameId }) => service.popOut(gameId), (issue) => failure(issue));
    handleBare(CHANNELS.gamesPopped, () => service.popped());
    handle(CHANNELS.gamesKitUpgrade, schemas.GamesKitUpgradeRequest, ({ gameId }) => service.kitUpgrade(gameId), (issue) => failure(issue));

    // Create and iterate (Theme M).
    handle(
      CHANNELS.gamesAgentRun,
      schemas.GamesAgentRunRequest,
      (req) => (agents ? agents.run(req) : failure(AGENTS_UNAVAILABLE)),
      (issue) => failure(issue),
    );
    handle(
      CHANNELS.gamesAgentCancel,
      schemas.GamesAgentCancelRequest,
      ({ gameId }) => (agents ? agents.cancel(gameId) : failure(AGENTS_UNAVAILABLE)),
      (issue) => failure(issue),
    );
    handle(
      CHANNELS.gamesAgentUndo,
      schemas.GamesAgentUndoRequest,
      ({ gameId, sha }) => (agents ? agents.undo(gameId, sha) : failure(AGENTS_UNAVAILABLE)),
      (issue) => failure(issue),
    );

    // The asset bridge (Theme N).
    handle(CHANNELS.gamesAssetSources, schemas.GamesAssetSourcesRequest, async ({ tab }) => ok(await assets.sources(tab)), (issue) => failure(issue));
    handle(CHANNELS.gamesImportAsset, schemas.GamesImportAssetRequest, (req) => assets.importAsset(req), (issue) => failure(issue));
    handle(CHANNELS.gamesResync, schemas.GamesResyncRequest, (req) => assets.resync(req), (issue) => failure(issue));

    // Play-tests (Theme O). The service throws named errors; they come back as failures.
    handle(
      CHANNELS.gamesPlaytests,
      schemas.GamesPlaytestsRequest,
      async ({ gameId }) => {
        if (!playtests) return failure(PLAYTESTS_UNAVAILABLE);
        try {
          return ok({ playtests: await playtests.list(gameId) });
        } catch (error) {
          return failure(error instanceof Error ? error.message : String(error));
        }
      },
      (issue) => failure(issue),
    );
    handle(
      CHANNELS.gamesPlaytestRun,
      schemas.GamesPlaytestRunRequest,
      async ({ gameId, names }) => {
        if (!playtests) return failure(PLAYTESTS_UNAVAILABLE);
        try {
          const { passed, runs } = await playtests.run(gameId, names ? { names } : {});
          return ok({ passed, runs });
        } catch (error) {
          return failure(error instanceof Error ? error.message : String(error));
        }
      },
      (issue) => failure(issue),
    );

    // Web export (Theme P): a folder, a zip or one HTML file. A file format with no `dest` asks with the
    // native save dialog (which asks about replacing, so a picked path may be overwritten); a folder's
    // `dest` is its parent and an existing `<slug>-web/` is always refused.
    handle(
      CHANNELS.gamesExport,
      schemas.GamesExportRequest,
      async (req) => {
        try {
          if (req.format === 'game-folder' || req.dest) return await exporter.exportGame(req);
          const game = await service.resolve(req.gameId);
          if (!game) return failure('That game was not found.');
          const { ext, label } = MEDIA_EXPORT_FORMAT_INFO[req.format];
          const picked = await pickSavePath({ defaultPath: `${gameSlug(game.name)}.${ext}`, filters: [{ name: label, extensions: [ext] }] });
          if (!picked) return failure('cancelled');
          return await exporter.exportGame({ ...req, dest: picked, overwrite: true });
        } catch (error) {
          return failure(error instanceof Error ? error.message : String(error));
        }
      },
      (issue) => failure(issue),
    );
  },
});
