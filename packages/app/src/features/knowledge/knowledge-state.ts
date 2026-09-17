// Layer: vitest — a pure reducer over the wire envelope, no DOM/browser
// capability needed. See `knowledge-state.test.ts`.
import type { KnowledgeGraphPayload, KnowledgeResult } from '@midnite/studio-shared';

/**
 * Phase 87 Theme F's state machine: what the Knowledge view (and the rail
 * row) renders for one repo, resolved from `knowledgeGetGraph`'s own 4-arm
 * failure envelope plus whether the query is still in flight.
 *
 * Deliberately not a 1:1 reskin of `KnowledgeResult` — `loading` has no
 * envelope arm of its own (react-query's `isLoading`, not the bridge, is
 * where that comes from), and `ready` folds `commitsBehind` into a `stale`
 * boolean the view can branch on without re-deriving it at every call site.
 */
export type KnowledgeViewState =
  | { kind: 'loading' }
  | { kind: 'absent' }
  | { kind: 'unreadable'; message: string }
  | { kind: 'malformed'; message: string }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      graph: KnowledgeGraphPayload;
      /** `commitsBehind !== null && commitsBehind > 0` — hoisted so a view need not re-derive it. */
      stale: boolean;
      /** `null` when staleness could not be determined (phase doc: reported, never guessed). */
      commitsBehind: number | null;
    };

/**
 * Resolve one repo's `KnowledgeViewState` from react-query's own two axes
 * (`isLoading`, `data`) — never a fifth branch invented for "loading with
 * stale data present," which `staleTime: Infinity` never produces here since
 * a repo switch is a brand new query key (Theme F's own "a repo switch
 * mid-load cannot land the previous repo's graph" requirement — see
 * `use-knowledge-graph.test.ts` for the integration proof of that, which this
 * pure function cannot cover on its own since the race is react-query's to
 * win, not this reducer's).
 */
export function resolveKnowledgeViewState(
  isLoading: boolean,
  result: KnowledgeResult<KnowledgeGraphPayload> | undefined,
): KnowledgeViewState {
  if (isLoading) return { kind: 'loading' };
  if (result === undefined) return { kind: 'error', message: 'Unable to load knowledge graph.' };

  if (!result.ok) {
    switch (result.kind) {
      case 'absent':
        return { kind: 'absent' };
      case 'unreadable':
        return { kind: 'unreadable', message: result.message };
      case 'malformed':
        return { kind: 'malformed', message: result.message };
      case 'error':
        return { kind: 'error', message: result.message };
      default:
        // Not an envelope at all — something wrote a foreign shape under the
        // graph's query key (a bare payload, once, from the layout switch).
        // An error state with a Retry is recoverable; a throw here lands in
        // the view's error boundary with no way back but a reload.
        return { kind: 'error', message: 'Unexpected knowledge graph response. Retry to reload it.' };
    }
  }

  const commitsBehind = result.value.commitsBehind;
  return {
    kind: 'ready',
    graph: result.value,
    stale: commitsBehind !== null && commitsBehind > 0,
    commitsBehind,
  };
}
