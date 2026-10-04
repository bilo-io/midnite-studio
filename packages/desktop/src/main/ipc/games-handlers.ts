import { CHANNELS, failure, schemas } from '@midnite/studio-shared';

import { defaultLogger } from '../log';
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
export function registerGamesHandlers(service: GameService): void {
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
}
