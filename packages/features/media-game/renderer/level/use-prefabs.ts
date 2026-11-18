import type { GamePrefab, GamePrefabListEntry } from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { bridge } from '@midnite/studio-frame';

const failureText = (result: { kind: string; message?: string }, fallback: string): string => result.message ?? fallback;

export const PREFAB_KEYS = {
  list: (gameId: string) => ['games', 'prefabs', gameId] as const,
  one: (gameId: string, name: string) => ['games', 'prefabs', gameId, name] as const,
};

/** The game's prefabs (`levels/prefabs/*.prefab.json`): name, dimension, object count. Phase 139 Theme G. */
export function usePrefabs(gameId: string | null) {
  return useQuery<GamePrefabListEntry[]>({
    queryKey: gameId ? PREFAB_KEYS.list(gameId) : ['games', 'prefabs', 'none'],
    enabled: gameId !== null,
    queryFn: async () => {
      const result = await bridge()?.games.levels.prefabs.list({ gameId: gameId! });
      if (!result) return [];
      if (!result.ok) throw new Error(failureText(result, 'The prefabs could not be listed.'));
      return result.value.prefabs;
    },
  });
}

/** One prefab's full file, always read fresh (an "Update from prefab" must see the file on disk). */
export async function fetchPrefab(client: QueryClient, gameId: string, name: string): Promise<GamePrefab> {
  return client.fetchQuery({
    queryKey: PREFAB_KEYS.one(gameId, name),
    staleTime: 0,
    queryFn: async () => {
      const result = await bridge()?.games.levels.prefabs.get({ gameId, name });
      if (!result) throw new Error('The app bridge is not available.');
      if (!result.ok) throw new Error(failureText(result, `Prefab "${name}" could not be read.`));
      return result.value.prefab;
    },
  });
}

/** Write a prefab file (one commit). Resolves to an error message, or `null` on success. */
export function useSavePrefab(gameId: string) {
  const client = useQueryClient();
  return useMutation<string | null, Error, GamePrefab>({
    mutationFn: async (prefab) => {
      const result = await bridge()?.games.levels.prefabs.set({ gameId, prefab });
      if (!result) return 'The app bridge is not available.';
      return result.ok ? null : failureText(result, 'The prefab could not be saved.');
    },
    onSuccess: (error, prefab) => {
      if (error === null) {
        void client.invalidateQueries({ queryKey: PREFAB_KEYS.list(gameId) });
        void client.invalidateQueries({ queryKey: PREFAB_KEYS.one(gameId, prefab.name) });
      }
    },
  });
}

/** Delete a prefab file (one commit). Instances already placed stay as plain tagged objects. */
export function useDeletePrefab(gameId: string) {
  const client = useQueryClient();
  return useMutation<string | null, Error, string>({
    mutationFn: async (name) => {
      const result = await bridge()?.games.levels.prefabs.delete({ gameId, name });
      if (!result) return 'The app bridge is not available.';
      return result.ok ? null : failureText(result, 'The prefab could not be deleted.');
    },
    onSuccess: (error) => {
      if (error === null) void client.invalidateQueries({ queryKey: ['games', 'prefabs', gameId] });
    },
  });
}
