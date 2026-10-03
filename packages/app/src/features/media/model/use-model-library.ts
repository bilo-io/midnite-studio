import type { GitOpResult, ModelLibraryNode } from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { bridge } from '../../../services/bridge';
import { noBridge, reportFailure } from '../../../services/bridge-result';
import { MEDIA_KEYS } from '../use-media';

/**
 * The Models explorer's data: the library tree (groups → model folders → files, with each folder's
 * `model.json`) and the folder operations. The key sits under `MEDIA_KEYS.tab`, so the same
 * `mediaChanged` ping that refreshes every other Media tab refreshes this one.
 *
 * The first read of a repo in a session runs `migrate` ahead of `list`: flat outputs from before the
 * folder layout are moved into folders (renames only, never a delete), and a failure there is not
 * fatal — the tree reads both layouts, so the list still comes back.
 */
export const libraryKey = (repoId: string) => [...MEDIA_KEYS.tab(repoId, 'model'), 'library'] as const;

const migrated = new Set<string>();
/** Test seam: forget which repos this session already migrated. */
export const resetMigrationMemo = (): void => migrated.clear();

export function useModelLibrary(repoId: string | null) {
  return useQuery<ModelLibraryNode[]>({
    queryKey: libraryKey(repoId ?? ''),
    enabled: repoId !== null,
    queryFn: async () => {
      const id = repoId ?? '';
      const api = bridge()?.media.model.library;
      if (!api) throw new Error('The Models library is unavailable without the desktop bridge.');
      if (!migrated.has(id)) {
        migrated.add(id);
        await api.migrate({ repoId: id }).catch(() => undefined);
      }
      const listed = await api.list({ repoId: id });
      if (!listed.ok) throw new Error(listed.kind === 'error' ? listed.message : 'Could not read the library.');
      return listed.value.tree;
    },
  });
}

/** Rename / move / delete / duplicate / new group — each reports a failure as a toast and refreshes the tree. */
export function useModelLibraryActions(repoId: string | null) {
  const client = useQueryClient();
  const id = repoId ?? '';
  const run = async <T>(call: ((api: NonNullable<ReturnType<typeof bridge>>['media']['model']['library']) => Promise<GitOpResult<T>>) | null): Promise<GitOpResult<T>> => {
    const api = bridge()?.media.model.library;
    const result = api && call ? await call(api) : noBridge<T>();
    reportFailure(result);
    if (result.ok && repoId) void client.invalidateQueries({ queryKey: MEDIA_KEYS.tab(repoId, 'model') });
    return result;
  };
  return {
    rename: useMutation({ mutationFn: (v: { path: string; to: string }) => run((api) => api.rename({ repoId: id, ...v })) }),
    move: useMutation({ mutationFn: (v: { path: string; toGroup: string }) => run((api) => api.move({ repoId: id, ...v })) }),
    remove: useMutation({ mutationFn: (v: { path: string }) => run((api) => api.delete({ repoId: id, ...v })) }),
    duplicate: useMutation({ mutationFn: (v: { path: string }) => run((api) => api.duplicate({ repoId: id, ...v })) }),
    newGroup: useMutation({ mutationFn: (v: { parent: string; name: string }) => run((api) => api.newGroup({ repoId: id, ...v })) }),
  };
}
