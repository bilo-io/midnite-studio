import { useEffect, useRef, useState } from 'react';

import type { KnowledgeGraphPayload } from '@midnite/studio-shared';

import { bridge } from '../../services/bridge';

export type KnowledgeGraphStatus =
  | { status: 'idle' }
  | { status: 'loading'; done: number; total: number }
  | { status: 'ok'; payload: KnowledgeGraphPayload }
  | { status: 'absent' }
  | { status: 'unreadable'; message: string }
  | { status: 'malformed'; message: string }
  | { status: 'error'; message: string };

/**
 * Fetches the active repo's knowledge graph over `window.midniteStudio.
 * knowledge`, and reports the cold-layout progress event while it runs
 * (Theme D: "something to show other than a frozen empty canvas").
 *
 * Guards a repo switch mid-load: the phase doc's own Theme F verification
 * names this race explicitly ("a repo switch mid-load cannot land the
 * previous repo's graph"), and getting the fetch itself right is Theme D's
 * job regardless of who builds the empty/stale UI chrome around it — a
 * stale `getGraph` resolving after the user has already switched repos must
 * never overwrite the new repo's state.
 */
export function useKnowledgeGraph(repoId: string | null): KnowledgeGraphStatus {
  const [state, setState] = useState<KnowledgeGraphStatus>({ status: 'idle' });
  const currentRepoRef = useRef<string | null>(null);

  useEffect(() => {
    const b = bridge();
    currentRepoRef.current = repoId;

    if (!repoId || !b) {
      setState({ status: 'idle' });
      return;
    }

    setState({ status: 'loading', done: 0, total: 0 });

    const unsubscribe = b.knowledge.onLayoutProgress((event) => {
      if (currentRepoRef.current !== repoId || event.repoId !== repoId) return;
      setState((prev) =>
        prev.status === 'loading' || prev.status === 'idle'
          ? { status: 'loading', done: event.done, total: event.total }
          : prev,
      );
    });

    void b.knowledge.getGraph({ repoId }).then((result) => {
      // Stale — the repo changed again while this request was in flight.
      if (currentRepoRef.current !== repoId) return;

      if (!result.ok) {
        if (result.kind === 'absent') {
          setState({ status: 'absent' });
          return;
        }
        setState({ status: result.kind, message: result.message });
        return;
      }
      setState({ status: 'ok', payload: result.value });
    });

    return () => {
      unsubscribe();
    };
  }, [repoId]);

  return state;
}
