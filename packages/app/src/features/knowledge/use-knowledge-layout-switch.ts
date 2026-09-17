import { useCallback, useEffect, useRef, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import type { KnowledgeGraphPayload, KnowledgeResult } from '@midnite/studio-shared';

import { bridge } from '../../services/bridge';
import { keys } from '../../services/queries';

/**
 * Switches the active repo's Knowledge layout without re-loading the view
 * (Phase 89 Theme E). `useKnowledgeGraph`'s own query is the base fetch —
 * one round trip per repo, on the layout the user last picked — and stays
 * keyed on `repoId` alone (`keys.knowledgeGraph`'s own docblock). A later
 * pill click goes around that query entirely: this hook calls
 * `knowledge.getGraph({repoId, layoutId})` directly and, on success, writes
 * the new RESULT ENVELOPE into the SAME cache entry with
 * `queryClient.setQueryData` rather than invalidating or refetching — a
 * direct cache write never
 * toggles `isLoading`, so `KnowledgeView`'s `state.kind` stays `'ready'`
 * throughout and the canvas tweens (`use-knowledge-renderer.ts`'s effect
 * 1b) instead of the whole `ready` branch unmounting for a spinner.
 *
 * `switching` is this hook's own loading flag, separate from
 * `useKnowledgeGraph`'s `isLoading` — `use-knowledge-layout-progress.ts`
 * takes either as its `loading` gate, so a layout switch's cold pass reports
 * progress through the exact same event stream the first load already uses.
 */
export function useKnowledgeLayoutSwitch(repoId: string | null): {
  switching: boolean;
  switchLayout: (layoutId: string) => void;
} {
  const queryClient = useQueryClient();
  const [switching, setSwitching] = useState(false);
  // Bumped on every call (and on a repo change) so a reply from a
  // superseded request — an earlier layout click, or a request for a repo
  // that is no longer open — never overwrites a later one's result.
  const tokenRef = useRef(0);

  useEffect(() => {
    tokenRef.current += 1;
    setSwitching(false);
  }, [repoId]);

  const switchLayout = useCallback(
    (layoutId: string) => {
      const activeRepoId = repoId;
      if (!activeRepoId) return;
      const api = bridge()?.knowledge;
      if (!api) return;

      const token = ++tokenRef.current;
      setSwitching(true);

      Promise.resolve(api.getGraph({ repoId: activeRepoId, layoutId }))
        .then((result) => {
          if (tokenRef.current !== token) return; // superseded
          if (result?.ok) {
            // The whole `{ok, value}` envelope, exactly what `useKnowledgeGraph`'s
            // own `queryFn` stores under this key — `resolveKnowledgeViewState`
            // reads `result.value.commitsBehind` off whatever is cached here, so
            // writing the bare payload (as this once did) threw
            // "Cannot read properties of undefined (reading 'commitsBehind')"
            // straight into the view's error boundary on every layout switch.
            queryClient.setQueryData<KnowledgeResult<KnowledgeGraphPayload>>(
              keys.knowledgeGraph(activeRepoId),
              result,
            );
          }
          setSwitching(false);
        })
        .catch(() => {
          if (tokenRef.current === token) setSwitching(false);
        });
    },
    [repoId, queryClient],
  );

  return { switching, switchLayout };
}
