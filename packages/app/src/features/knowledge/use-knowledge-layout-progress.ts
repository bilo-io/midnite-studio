import { useEffect, useRef, useState } from 'react';

import { bridge } from '../../services/bridge';

export type KnowledgeLayoutProgress = { done: number; total: number } | null;

/**
 * Cold-layout progress for `repoId`, over `knowledgeLayoutProgress` (Theme
 * B's event). Split out of `use-knowledge-graph.ts` on purpose: that hook is
 * Theme F's (react-query, repo-switch-safe by construction) and its own
 * docblock says plainly that surfacing this event is deliberately NOT its
 * job — "Theme D's canvas is where that progress bar belongs." This is that
 * addition, layered on top rather than folded in, so Theme F's file stays
 * exactly what Theme F shipped.
 *
 * `loading` gates it rather than this hook re-deriving its own notion of
 * "in flight": once `useKnowledgeGraph`'s `state.kind` leaves `'loading'`
 * (a cache hit never fires the event at all, or the graph has resolved,
 * failed, or an absent/unreadable/malformed answer arrived), whatever
 * progress was showing is stale by definition and clears immediately rather
 * than lingering into the next state.
 */
export function useKnowledgeLayoutProgress(
  repoId: string | null,
  loading: boolean,
): KnowledgeLayoutProgress {
  const [progress, setProgress] = useState<KnowledgeLayoutProgress>(null);
  const repoRef = useRef(repoId);

  useEffect(() => {
    repoRef.current = repoId;
    setProgress(null);

    const b = bridge();
    if (!repoId || !b) return;

    const unsubscribe = b.knowledge.onLayoutProgress((event) => {
      if (repoRef.current !== repoId || event.repoId !== repoId) return;
      setProgress({ done: event.done, total: event.total });
    });

    return () => unsubscribe();
  }, [repoId]);

  useEffect(() => {
    if (!loading) setProgress(null);
  }, [loading]);

  return progress;
}
