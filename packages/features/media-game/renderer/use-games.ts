import type {
  GameAssetSourceTab,
  GameAssetSourcesResult,
  GameAddResult,
  GameCreateRequest,
  GameImportAssetRequest,
  GameImportAssetResult,
  GamePlaytestEntry,
  GamePlaytestRunResult,
  GameResyncResult,
  GameSummary,
  GamesSettingsPatch,
  GamesSettingsRead,
} from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { bridge } from '@midnite/studio-frame';
import { noBridge, reportFailure } from '@midnite/studio-frame';
import { useGameRunStore } from './game-run-store';

/**
 * Media ▸ Games (Phase 107). Global, not per-repo, so these keys carry no
 * `repoId` — the same call `use-video.ts` makes.
 */
export const GAME_KEYS = {
  list: ['games', 'list'] as const,
  settings: ['games', 'settings'] as const,
  manifest: (gameId: string) => ['games', 'manifest', gameId] as const,
  /** Theme N: imported assets and whether their sources moved on. */
  assets: (gameId: string) => ['games', 'assets', gameId] as const,
  assetSources: (tab: string) => ['games', 'asset-sources', tab] as const,
  /** Theme O: `playtests/*.json` with their last results. */
  playtests: (gameId: string) => ['games', 'playtests', gameId] as const,
};

/**
 * The app's repo list lives under this key. The feature can't import the
 * app's `keys`, so it names the key literally, as `useCreateGame` does.
 */
const REPOS_KEY = ['repos'] as const;

/**
 * Main lists every registered repo whose root carries a `midnite-game.json`
 * beside the games root. Queries never go stale in this app, so without this
 * a repo opened from the repos panel would not show up until a reload.
 */
export function useGamesFollowRepos(): void {
  const client = useQueryClient();
  useEffect(
    () =>
      client.getQueryCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'success') return;
        const key = event.query.queryKey;
        if (key.length !== REPOS_KEY.length || key[0] !== REPOS_KEY[0]) return;
        void client.invalidateQueries({ queryKey: GAME_KEYS.list });
      }),
    [client],
  );
}

export function useGames() {
  useGamesFollowRepos();
  return useQuery<GameSummary[]>({
    queryKey: GAME_KEYS.list,
    queryFn: async () => (await bridge()?.games.list())?.games ?? [],
  });
}

export function useGamesSettings() {
  return useQuery<GamesSettingsRead | null>({
    queryKey: GAME_KEYS.settings,
    queryFn: async () => (await bridge()?.games.settings.get()) ?? null,
  });
}

export function useSetGamesSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (patch: GamesSettingsPatch) =>
      (await bridge()?.games.settings.set(patch)) ?? noBridge<GamesSettingsRead>(),
    onSuccess: (result) => {
      reportFailure(result);
      void client.invalidateQueries({ queryKey: GAME_KEYS.settings });
      void client.invalidateQueries({ queryKey: GAME_KEYS.list });
    },
  });
}

export function useCreateGame() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (req: GameCreateRequest) => (await bridge()?.games.create(req)) ?? noBridge<{ path: string; gameId: string }>(),
    onSuccess: (result) => {
      reportFailure(result);
      if (result.ok) {
        void client.invalidateQueries({ queryKey: GAME_KEYS.list });
        // The new repo is in the repo list too.
        void client.invalidateQueries({ queryKey: REPOS_KEY });
      }
    },
  });
}

/** Open Game (Phase 132 Theme A): the folder dialog lives in main; `added` and `listed` both leave the game in the list. */
export function useAddGame() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => (await bridge()?.games.add({})) ?? noBridge<GameAddResult>(),
    onSuccess: (result) => {
      // Narrowed first: `GitOpResult<T>` distributes over a union `T`, which a union result is not assignable to.
      if (!result.ok) reportFailure(result);
      if (result.ok && result.value.status !== 'cancelled') {
        void client.invalidateQueries({ queryKey: GAME_KEYS.list });
        void client.invalidateQueries({ queryKey: REPOS_KEY });
      }
    },
  });
}

export function useRunGame() {
  return useMutation({
    mutationFn: async (gameId: string) => (await bridge()?.games.run({ gameId })) ?? noBridge<{ runId: string }>(),
    onSuccess: (result) => reportFailure(result),
  });
}

/** Pop out (Theme B): move the game's view into the `game` window. */
export function usePopOutGame() {
  return useMutation({
    mutationFn: async (gameId: string) => (await bridge()?.games.popOut({ gameId })) ?? noBridge<void>(),
    onSuccess: (result) => {
      if (!result.ok && result.kind === 'error') reportFailure(result);
    },
  });
}

export function useStopGame() {
  return useMutation({
    mutationFn: async (gameId: string) => (await bridge()?.games.stop({ gameId })) ?? noBridge<void>(),
  });
}

/**
 * Subscribe to run state, console batches and on-disk changes. Mounted once, by
 * the Games tab: a game keeps running when the tab is hidden (its view is
 * hidden), but the drawer only needs events while it is on screen.
 */
export function useGameEvents(): void {
  const client = useQueryClient();
  useEffect(() => {
    const api = bridge();
    if (!api) return undefined;
    const offs = [
      api.games.onRunState((event) => useGameRunStore.getState().applyRunState(event)),
      api.games.onConsole((event) => useGameRunStore.getState().appendLogs(event.gameId, event.runId, event.entries)),
      api.games.onChanged(() => {
        void client.invalidateQueries({ queryKey: GAME_KEYS.list });
        void client.invalidateQueries({ queryKey: ['games', 'assets'] });
      }),
      // A source in the media store changed: the "N assets changed" badge may need to move.
      api.media.onChanged(() => {
        void client.invalidateQueries({ queryKey: ['games', 'assets'] });
        void client.invalidateQueries({ queryKey: ['games', 'asset-sources'] });
      }),
      api.games.onPopState((event) => useGameRunStore.getState().setPopped(event.gameId)),
    ];
    // Seed what this renderer missed before it subscribed: which game is popped
    // out, and — in the popout's own fresh renderer — that game's current run.
    let live = true;
    void api.games.popped().then((answer) => {
      if (!live) return;
      const store = useGameRunStore.getState();
      store.setPopped(answer.gameId);
      const run = answer.run;
      if (!run || store.runs[run.gameId]) return;
      store.applyRunState(run);
      void api.games.logs({ gameId: run.gameId }).then((logs) => {
        if (live && logs.runId === run.runId) useGameRunStore.getState().appendLogs(run.gameId, run.runId, logs.entries);
      });
    });
    return () => {
      live = false;
      for (const off of offs) off();
    };
  }, [client]);
}

/**
 * Theme N: a game's imported assets with their sync state (a check, which writes nothing). Refetches on
 * window focus and on `media:changed`, which is how the explorer's "2 assets changed" badge stays honest.
 */
export function useGameAssets(gameId: string, enabled = true) {
  return useQuery<GameResyncResult | null>({
    queryKey: GAME_KEYS.assets(gameId),
    enabled,
    queryFn: async () => {
      const result = await bridge()?.games.assets.resync({ gameId, check: true });
      return result?.ok ? result.value : null;
    },
  });
}

/** The picker's candidates for one tab, across the registered repos. */
export function useAssetSources(tab: GameAssetSourceTab) {
  return useQuery<GameAssetSourcesResult>({
    queryKey: GAME_KEYS.assetSources(tab),
    queryFn: async () => {
      const result = await bridge()?.games.assets.sources({ tab });
      return result?.ok ? result.value : { repos: [] };
    },
  });
}

export function useImportAsset() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (req: GameImportAssetRequest) =>
      (await bridge()?.games.assets.import(req)) ?? noBridge<GameImportAssetResult>(),
    onSuccess: (result) => {
      reportFailure(result);
      void client.invalidateQueries({ queryKey: ['games', 'assets'] });
      void client.invalidateQueries({ queryKey: GAME_KEYS.list });
    },
  });
}

/** Re-import the changed assets (all of them, or `names`) as one commit. */
export function useReimportAssets() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (req: { gameId: string; names?: string[] }) =>
      (await bridge()?.games.assets.resync(req)) ?? noBridge<GameResyncResult>(),
    onSuccess: (result) => {
      reportFailure(result);
      void client.invalidateQueries({ queryKey: ['games', 'assets'] });
      void client.invalidateQueries({ queryKey: GAME_KEYS.list });
    },
  });
}

/** Theme O: a game's play-tests, each with its last saved result. */
export function useGamePlaytests(gameId: string | null, enabled = true) {
  return useQuery<GamePlaytestEntry[]>({
    queryKey: GAME_KEYS.playtests(gameId ?? ''),
    enabled: enabled && gameId !== null,
    queryFn: async () => {
      if (!gameId) return [];
      const result = await bridge()?.games.playtests.list({ gameId });
      return result?.ok ? result.value.playtests : [];
    },
  });
}

/** Run some play-tests (or all, with no names) in deterministic mode. */
export function useRunPlaytests() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (req: { gameId: string; names?: string[] }) =>
      (await bridge()?.games.playtests.run(req)) ?? noBridge<GamePlaytestRunResult>(),
    onSuccess: (result, req) => {
      reportFailure(result);
      void client.invalidateQueries({ queryKey: GAME_KEYS.playtests(req.gameId) });
    },
  });
}
