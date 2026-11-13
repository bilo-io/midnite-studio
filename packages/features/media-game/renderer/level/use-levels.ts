import type { GameGotoResult, GameLevelGetResult, GameLevelsResult, GameManifest } from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { bridge, noBridge, reportFailure } from '@midnite/studio-frame';

import { GAME_KEYS } from '../use-games';
import { markSaved, serialise } from './level-edit-model';
import { useLevelStore } from './level-store';

const failureText = (result: { kind: string; message?: string }): string => result.message ?? 'The level could not be read.';

/** `['games', 'levels', gameId]` and, under the same prefix, one scene: one `invalidateQueries` reaches both. */
export const LEVEL_KEYS = {
  all: ['games', 'levels'] as const,
  list: (gameId: string) => GAME_KEYS.levels(gameId),
  level: (gameId: string, scene: string) => GAME_KEYS.level(gameId, scene),
};

/** `levels/*.tmj` with the manifest's start scene and whether the game reads them. */
export function useLevels(gameId: string | null) {
  return useQuery<GameLevelsResult | null>({
    queryKey: gameId ? LEVEL_KEYS.list(gameId) : [...LEVEL_KEYS.all, 'none'],
    enabled: gameId !== null,
    queryFn: async () => {
      const result = await bridge()?.games.levels.list({ gameId: gameId! });
      if (!result) return null;
      if (!result.ok) throw new Error(failureText(result));
      return result.value;
    },
  });
}

/** One scene's raw level, its parse issues and its tileset images. */
export async function fetchLevel(client: ReturnType<typeof useQueryClient>, gameId: string, scene: string): Promise<GameLevelGetResult> {
  return client.fetchQuery({
    queryKey: LEVEL_KEYS.level(gameId, scene),
    staleTime: 0,
    queryFn: async () => {
      const result = await bridge()?.games.levels.get({ gameId, scene });
      if (!result) throw new Error('The app bridge is not available.');
      if (!result.ok) throw new Error(failureText(result));
      return result.value;
    },
  });
}

export function useLevel(gameId: string | null, scene: string | null) {
  return useQuery<GameLevelGetResult>({
    queryKey: gameId && scene ? LEVEL_KEYS.level(gameId, scene) : [...LEVEL_KEYS.all, 'none-level'],
    enabled: gameId !== null && scene !== null,
    queryFn: async () => {
      const result = await bridge()?.games.levels.get({ gameId: gameId!, scene: scene! });
      if (!result) throw new Error('The app bridge is not available.');
      if (!result.ok) throw new Error(failureText(result));
      return result.value;
    },
  });
}

/** Write one level as one commit; refreshes the list and every cached level of the game. */
export function useSaveLevel() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (req: { gameId: string; scene: string; level: unknown; create?: boolean }) =>
      (await bridge()?.games.levels.set(req)) ?? noBridge<{ sha: string | null }>(),
    onSuccess: (result, req) => {
      reportFailure(result);
      if (result.ok) void client.invalidateQueries({ queryKey: LEVEL_KEYS.list(req.gameId) });
    },
  });
}

/** Restart the running game at a scene (or set where the next run starts). */
export function useGotoScene() {
  return useMutation({
    mutationFn: async (req: { gameId: string; scene: string }) => (await bridge()?.games.goto(req)) ?? noBridge<GameGotoResult>(),
    onSuccess: (result) => {
      if (!result.ok) reportFailure(result);
    },
  });
}

export function useGameManifest(gameId: string | null) {
  return useQuery<GameManifest | null>({
    queryKey: gameId ? GAME_KEYS.manifest(gameId) : ['games', 'manifest', 'none'],
    enabled: gameId !== null,
    queryFn: async () => (await bridge()?.games.manifest.get({ gameId: gameId! }))?.manifest ?? null,
  });
}

/** Opt a game into reading `levels/`: sets the manifest's `levels` key (Decision 14). */
export function useSetLevelsStart() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (req: { gameId: string; start: string }) =>
      (await bridge()?.games.manifest.set({ gameId: req.gameId, patch: { levels: { dir: 'levels', start: req.start } } })) ?? noBridge<void>(),
    onSuccess: (result, req) => {
      if (!result.ok) reportFailure(result);
      void client.invalidateQueries({ queryKey: GAME_KEYS.manifest(req.gameId) });
      void client.invalidateQueries({ queryKey: LEVEL_KEYS.list(req.gameId) });
    },
  });
}

/** Save the game's open level (the editor's Save and the picker's "Save changes?" share it). Answers whether it landed. */
export function useSaveOpenLevel(gameId: string | null): () => Promise<boolean> {
  const save = useSaveLevel();
  return async () => {
    if (!gameId) return false;
    const entry = useLevelStore.getState().byGame[gameId];
    if (!entry) return false;
    const level = serialise(entry.edit);
    const result = await save.mutateAsync({ gameId, scene: entry.scene, level });
    if (!result.ok) return false;
    // Only what was written is clean: an edit made while the save was in flight stays dirty.
    useLevelStore.getState().update(gameId, (edit) => (edit.level === entry.edit.level ? markSaved(edit) : { ...edit, saved: entry.edit.level, dirty: edit.level !== entry.edit.level }));
    return true;
  };
}
