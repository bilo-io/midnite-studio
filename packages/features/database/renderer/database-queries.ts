import { useQuery } from '@tanstack/react-query';

import { bridge } from '@midnite/studio-frame';
import type { SchemaTree } from '@midnite/studio-shared';

/**
 * The Database tool's one query hook and its key (Phase 113 Theme O) — moved out of the app's
 * `services/queries.ts`, which re-exports the key as `keys.dbSchema` so the companion's cache peek
 * keeps reading the same entry.
 */
export const dbSchemaKey = (connectionId: string) => ['db', connectionId, 'schema'] as const;

/**
 * How long a connection's schema tree stays fresh (Phase 61 Theme F).
 *
 * There is no watcher for a database's own catalog the way `repo-watcher.ts`
 * watches `.git` — a schema change (a migration run outside the app) is
 * invisible to us either way, so this is a plain re-fetch-on-remount window
 * rather than a claim of freshness. A minute matches the forge listings'
 * own reasoning: short enough that reopening a connection after a migration
 * shows it, long enough that re-expanding a tree node mid-session does not
 * re-run `dbGetSchema`.
 */
const DB_SCHEMA_STALE_MS = 60_000;

/**
 * One connection's introspected schema tree, fetched only while its tree
 * section is expanded — `enabled` is the caller's own fold-AND gate
 * (`connection-tree.tsx`'s `sectionOpen && open`). A `{ok:false}` answer becomes a thrown error so
 * the query's own `error` state carries the one sentence the tree renders.
 */
export function useSchemaTree(connectionId: string | null, enabled: boolean) {
  return useQuery<SchemaTree>({
    queryKey: dbSchemaKey(connectionId ?? ''),
    queryFn: async () => {
      const api = bridge();
      if (!api || !connectionId) throw new Error('No connection to the app.');
      const result = await api.db.getSchema({ connectionId });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    enabled: enabled && connectionId !== null,
    staleTime: DB_SCHEMA_STALE_MS,
  });
}
