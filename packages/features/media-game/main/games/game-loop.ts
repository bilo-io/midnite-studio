import type { GameView } from './game-electron';
import { createGameMcpTools, type GameMcpTools, type GamePageContents } from './game-mcp';
import type { GamesRuntime } from './games-runtime';
import { createPlaytests, type Playtests } from './playtest';

/**
 * The play-test loop over one `GamesRuntime` (Phase 113 Theme S slice 3) — play-tests (Theme O) and the
 * `game_*` tool implementations (Theme D), wired the same way in Studio and Gamer. What only the app has is
 * the page behind a run's view: Electron's `WebContents`, which the feature reaches through `contents`, a
 * cast the composer makes once (the feature never imports `electron`).
 *
 * The tools are ungated here. Studio wraps them in its global server's consent switch (`mcp/game-tools.ts`);
 * an agent run's private server answers them for one game (`createGameAgentDispatch`).
 */
export type GameLoopDeps<V extends GameView = GameView> = {
  runtime: Pick<GamesRuntime<V>, 'runner' | 'service' | 'assets'>;
  /** A run's page: the view's web contents, narrowed. */
  contents: (view: V) => (GamePageContents & { isDestroyed?(): boolean }) | null;
};

export type GameLoop = { playtests: Playtests; tools: GameMcpTools };

export function createGameLoop<V extends GameView = GameView>(deps: GameLoopDeps<V>): GameLoop {
  const { runner, service, assets } = deps.runtime;
  const contentsOf = (gameId: string): (GamePageContents & { isDestroyed?(): boolean }) | null => {
    const view = runner.view(gameId);
    return view ? deps.contents(view) : null;
  };
  // Deterministic restarts, replays and assertions through the kit hook.
  const playtests = createPlaytests({
    resolve: (target) => service.resolve(target),
    runDeterministic: (gameId, seed) => service.run(gameId, { determinism: { seed, paused: true } }),
    setRunState: (gameId, state) => service.toolbar(gameId, state),
    page: (gameId) => {
      const wc = contentsOf(gameId);
      if (!wc || wc.isDestroyed?.()) return null;
      return { evaluate: (code) => wc.executeJavaScript(code, false), capture: async () => (await wc.capturePage()).toPNG() };
    },
  });
  const tools = createGameMcpTools({
    service,
    webContents: contentsOf,
    importAsset: (req) => assets.importAsset(req),
    playtests,
  });
  return { playtests, tools };
}
