import type {
  GameAssetSourceTab,
  GameAssetSourcesResult,
  GameLibraryFile,
  GameLibraryListing,
  GameAddRequest,
  GameAddResult,
  GameCreateRequest,
  GameDeleteInfo,
  GameDiagnosis,
  GameFixRequest,
  GameFixResult,
  GameImportAssetRequest,
  GameLibraryImportRequest,
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
  assetLibrary: ['games', 'asset-library'] as const,
  assetLibraryFile: (collection: string, path: string) => ['games', 'asset-library', 'file', collection, path] as const,
  assetSources: (tab: string) => ['games', 'asset-sources', tab] as const,
  /** Theme O: `playtests/*.json` with their last results. */
  playtests: (gameId: string) => ['games', 'playtests', gameId] as const,
  /** Phase 132 Theme D: `levels/*.tmj`, and one scene under the same prefix. */
  levels: (gameId: string) => ['games', 'levels', gameId] as const,
  level: (gameId: string, scene: string) => ['games', 'levels', gameId, scene] as const,
  /** Phase 149 Theme G: the game doctor's diagnosis. */
  doctor: (gameId: string) => ['games', 'doctor', gameId] as const,
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
      void client.invalidateQueries({ queryKey: GAME_KEYS.assetLibrary });
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

/**
 * Open Game (Phase 132 Theme A): the folder dialog lives in main; `added` and `listed` both leave the game in the list.
 * A folder with no manifest answers `needs-manifest` and registers nothing (Phase 149 Theme F); call again with the
 * `path` and the confirmed `confirmManifest`.
 */
export function useAddGame() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (req: GameAddRequest | undefined) => (await bridge()?.games.add(req ?? {})) ?? noBridge<GameAddResult>(),
    onSuccess: (result) => {
      // Narrowed first: `GitOpResult<T>` distributes over a union `T`, which a union result is not assignable to.
      if (!result.ok) reportFailure(result);
      if (result.ok && result.value.status !== 'cancelled' && result.value.status !== 'needs-manifest') {
        void client.invalidateQueries({ queryKey: GAME_KEYS.list });
        void client.invalidateQueries({ queryKey: REPOS_KEY });
      }
    },
  });
}

/** Game management (Phase 149 Theme I). A failure toasts; main sends `gamesChanged`, and the list refreshes on that. */
export function useRenameGame() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (req: { gameId: string; name: string }) => (await bridge()?.games.rename(req)) ?? noBridge<void>(),
    onSuccess: (result) => {
      if (!result.ok) reportFailure(result);
      void client.invalidateQueries({ queryKey: GAME_KEYS.list });
    },
  });
}

export function useRevealGame() {
  return useMutation({
    mutationFn: async (gameId: string) => (await bridge()?.games.reveal({ gameId })) ?? noBridge<void>(),
    onSuccess: (result) => {
      if (!result.ok) reportFailure(result);
    },
  });
}

export function useForgetGame() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (gameId: string) => (await bridge()?.games.forget({ gameId })) ?? noBridge<void>(),
    onSuccess: (result) => {
      if (!result.ok) reportFailure(result);
      void client.invalidateQueries({ queryKey: GAME_KEYS.list });
      // In Studio the game's repo left the repos panel too.
      void client.invalidateQueries({ queryKey: REPOS_KEY });
    },
  });
}

/** What deleting would lose, read when the confirm opens. Never cached: the numbers must be current. */
export function useGameDeleteInfo(gameId: string | null) {
  return useQuery<GameDeleteInfo | null>({
    queryKey: ['games', 'delete-info', gameId],
    enabled: gameId !== null,
    gcTime: 0,
    queryFn: async () => {
      const result = await bridge()?.games.deleteInfo({ gameId: gameId as string });
      return result?.ok ? result.value : null;
    },
  });
}

export function useDeleteGame() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (req: { gameId: string; confirmName: string }) => (await bridge()?.games.delete(req)) ?? noBridge<void>(),
    onSuccess: (result) => {
      if (!result.ok) reportFailure(result);
      void client.invalidateQueries({ queryKey: GAME_KEYS.list });
      void client.invalidateQueries({ queryKey: REPOS_KEY });
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
      api.games.onChanged((event) => {
        void client.invalidateQueries({ queryKey: GAME_KEYS.list });
        void client.invalidateQueries({ queryKey: ['games', 'assets'] });
        // Phase 139 Theme C: the level editor's asset browser reads the manifest's assets, so an import shows up live.
        void client.invalidateQueries({ queryKey: ['games', 'manifest'] });
        void client.invalidateQueries({ queryKey: ['games', 'doctor'] });
        if (event.reason === 'level') void client.invalidateQueries({ queryKey: ['games', 'levels'] });
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

/** The shared asset library's collections (read-only). A failed list reads as an error message. */
export function useAssetLibrary(enabled: boolean) {
  return useQuery<{ listing: GameLibraryListing | null; error: string | null }>({
    queryKey: GAME_KEYS.assetLibrary,
    enabled,
    queryFn: async () => {
      const result = await bridge()?.games.assets.library.list();
      if (!result) return { listing: null, error: null };
      return result.ok ? { listing: result.value, error: null } : { listing: null, error: result.kind === 'error' ? result.message : 'Could not list the asset library.' };
    },
  });
}

/** One library file for the inspector (a data URL for small images and audio). */
export function useAssetLibraryFile(collection: string, path: string) {
  return useQuery<GameLibraryFile | null>({
    queryKey: GAME_KEYS.assetLibraryFile(collection, path),
    queryFn: async () => {
      const result = await bridge()?.games.assets.library.read({ collection, path });
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

/** Import one shared-library asset into a game; a success toasts, a failure goes through `reportFailure`. */
export function useImportLibraryAsset() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (req: GameLibraryImportRequest) =>
      (await bridge()?.games.assets.library.import(req)) ?? noBridge<GameImportAssetResult>(),
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

/** The game doctor's diagnosis (Phase 149 Theme C); refetched on `gamesChanged` and by the panel's Re-check. */
export function useGameDiagnosis(gameId: string | null, enabled = true) {
  return useQuery<GameDiagnosis | null>({
    queryKey: gameId ? GAME_KEYS.doctor(gameId) : ['games', 'doctor', 'none'],
    enabled: enabled && gameId !== null,
    queryFn: async () => {
      const result = await bridge()?.games.doctor({ gameId: gameId! });
      if (!result) return null;
      if (!result.ok) throw new Error(result.kind === 'error' ? result.message : 'The doctor could not run.');
      return result.value;
    },
  });
}

/**
 * Apply one doctor fix (Theme D). A refusal comes back as the result for the panel to show inline; the fresh
 * diagnosis it answers replaces the cached one, and the list refreshes for the status dot.
 */
export function useDoctorFix(gameId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (req: Omit<GameFixRequest, 'gameId' | 'path'>) =>
      (await bridge()?.games.doctorFix({ ...req, gameId })) ?? noBridge<GameFixResult>(),
    onSuccess: (result) => {
      if (result.ok) client.setQueryData(GAME_KEYS.doctor(gameId), result.value.diagnosis);
      void client.invalidateQueries({ queryKey: GAME_KEYS.list });
      void client.invalidateQueries({ queryKey: ['games', 'levels', gameId] });
    },
  });
}
