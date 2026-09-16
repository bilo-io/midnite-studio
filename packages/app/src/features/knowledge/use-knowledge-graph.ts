import type { KnowledgeGraphPayload, KnowledgeResult } from '@midnite/studio-shared';
import { useQuery } from '@tanstack/react-query';

import { bridge } from '../../services/bridge';
import { keys } from '../../services/queries';
import { resolveKnowledgeViewState, type KnowledgeViewState } from './knowledge-state';

/**
 * The active repo's lean, laid-out graph (Phase 87 Themes A/B, wired here for
 * Theme F's empty/stale/malformed states — Theme D reads the same hook for
 * the canvas's `nodes`/`links`/`positions`).
 *
 * `enabled: repoId !== null` rather than a guard the caller writes: `null` is
 * "no repo selected," which the Knowledge view never actually renders in
 * (`view-registry.tsx`'s `knowledge` entry is not `global: true`, so
 * `EmptyWorkspace` stands in first) — but a component that calls this hook
 * before that gate settles must not fire a request keyed on `'null'`.
 *
 * The **repo-switch race** the phase doc calls out ("a repo switch mid-load
 * cannot land the previous repo's graph") is react-query's own guarantee, not
 * bespoke code here: `repoId` is baked into the query key
 * (`keys.knowledgeGraph`), so switching repos subscribes the caller to a
 * DIFFERENT cache entry immediately — `data`/`isLoading` for the new key,
 * `undefined`/`true` until it resolves — while the superseded promise, when
 * it eventually settles, writes only into the OLD key's entry, which nothing
 * is reading any more. See `use-knowledge-graph.test.ts` for the integration
 * proof: a first repo's `getGraph` resolving AFTER a switch to a second repo
 * must never be observed by the hook.
 */
export function useKnowledgeGraph(repoId: string | null): {
  state: KnowledgeViewState;
  refetch: () => void;
} {
  const { data, isLoading, refetch } = useQuery({
    queryKey: keys.knowledgeGraph(repoId ?? 'none'),
    enabled: repoId !== null,
    queryFn: async (): Promise<KnowledgeResult<KnowledgeGraphPayload>> => {
      try {
        const result = await bridge()?.knowledge.getGraph({ repoId: repoId as string });
        return result ?? { ok: false, kind: 'error', message: 'No bridge available.' };
      } catch (error) {
        return {
          ok: false,
          kind: 'error',
          message: error instanceof Error ? error.message : 'Unable to load knowledge graph.',
        };
      }
    },
  });

  return {
    state: resolveKnowledgeViewState(isLoading, data),
    refetch: () => void refetch(),
  };
}

/**
 * Theme F's rail-greying check — a `stat`, never `knowledgeGetGraph`'s
 * parse/layout. `undefined` while unresolved (or with no repo selected) reads
 * as "don't grey" at the one call site (`app.tsx`): a briefly-ungreyed icon
 * while the check is in flight is a far smaller wrong than greying every
 * pinned row for the instant before any repo's status is known.
 */
export function useKnowledgeGraphExists(repoId: string | null): boolean | undefined {
  const { data } = useQuery({
    queryKey: keys.knowledgeStatus(repoId ?? 'none'),
    enabled: repoId !== null,
    queryFn: async () => {
      const result = await bridge()?.knowledge.checkGraph({ repoId: repoId as string });
      return result?.exists ?? false;
    },
  });

  return data;
}
