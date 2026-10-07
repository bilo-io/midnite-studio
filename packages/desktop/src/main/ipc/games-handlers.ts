import { CHANNELS, failure, ok, schemas } from '@midnite/studio-shared';

import { defaultLogger } from '../log';
import type { AssetBridge } from '../games/asset-bridge';
import type { GameAgentService } from '../games/game-agent-service';
import type { GameService } from '../games/game-service';
import { handle, handleBare, handleSend } from './handle';

const warnInvalid = (issue: string): void => {
  defaultLogger.warn(issue);
};

/**
 * `mstudio:games:*` (Phase 107 Themes A + B) — thin adapters over one
 * `GameService`. `setBounds`/`setVisible` are one-way like `apps.setBounds`: a
 * bounds push fires every resize frame and a round trip would only add latency.
 */
export function registerGamesHandlers(service: GameService, agents?: GameAgentService, assets?: AssetBridge): void {
  handleBare(CHANNELS.gamesSettingsGet, () => service.settings.get());

  handle(
    CHANNELS.gamesSettingsSet,
    schemas.GamesSettingsSetRequest,
    (patch) => service.settings.set(patch),
    (issue) => failure(issue),
  );

  handleBare(CHANNELS.gamesList, async () => ({ games: await service.list() }));

  handle(
    CHANNELS.gamesCreate,
    schemas.GamesCreateRequest,
    (req) => service.create(req),
    (issue) => failure(issue),
  );

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
  handle(
    CHANNELS.gamesReload,
    schemas.GamesReloadRequest,
    ({ gameId }) => service.reload(gameId),
    (issue) => failure(issue),
  );

  handleSend(
    CHANNELS.gamesSetBounds,
    schemas.GamesSetBoundsRequest,
    ({ gameId, bounds }) => service.setBounds(gameId, bounds),
    warnInvalid,
  );
  handleSend(
    CHANNELS.gamesSetVisible,
    schemas.GamesSetVisibleRequest,
    ({ gameId, visible }) => service.setVisible(gameId, visible),
    warnInvalid,
  );

  handle(
    CHANNELS.gamesToolbar,
    schemas.GamesToolbarRequest,
    ({ gameId, action, value }) => service.toolbar(gameId, action, value),
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

  handle(
    CHANNELS.gamesKitUpgrade,
    schemas.GamesKitUpgradeRequest,
    ({ gameId }) => service.kitUpgrade(gameId),
    (issue) => failure(issue),
  );

  // Create and iterate (Theme M). Absent only in tests that never run an agent.
  if (agents) {
    handle(CHANNELS.gamesAgentRun, schemas.GamesAgentRunRequest, (req) => agents.run(req), (issue) => failure(issue));
    handle(CHANNELS.gamesAgentCancel, schemas.GamesAgentCancelRequest, ({ gameId }) => agents.cancel(gameId), (issue) => failure(issue));
    handle(
      CHANNELS.gamesAgentUndo,
      schemas.GamesAgentUndoRequest,
      ({ gameId, sha }) => agents.undo(gameId, sha),
      (issue) => failure(issue),
    );
  }

  // The asset bridge (Theme N).
  if (assets) {
    handle(CHANNELS.gamesAssetSources, schemas.GamesAssetSourcesRequest, async ({ tab }) => ok(await assets.sources(tab)), (issue) => failure(issue));
    handle(CHANNELS.gamesImportAsset, schemas.GamesImportAssetRequest, (req) => assets.importAsset(req), (issue) => failure(issue));
    handle(CHANNELS.gamesResync, schemas.GamesResyncRequest, (req) => assets.resync(req), (issue) => failure(issue));
  }
}
