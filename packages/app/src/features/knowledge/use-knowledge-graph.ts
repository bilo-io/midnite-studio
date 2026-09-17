import type { KnowledgeGraphPayload, KnowledgeResult, MidniteStudioBridge } from '@midnite/studio-shared';
import { useQuery } from '@tanstack/react-query';

import { bridge } from '../../services/bridge';
import { keys } from '../../services/queries';
import { resolveKnowledgeViewState, type KnowledgeViewState } from './knowledge-state';

/**
 * How long the renderer waits for main to say *anything* about a `getGraph`
 * call before giving up on it. Reset on every `knowledgeLayoutProgress`
 * event for this repo, so it is a silence budget, not a total budget: a large
 * graph that keeps reporting batches never trips it, a call that has stopped
 * answering does.
 *
 * Measured on this repo's own graph (15,199 nodes / 36,772 links) in the
 * packaged app: the read-and-git phase before the first progress event takes
 * well under a second, and layout batches arrive every 2-4 s. Main's own
 * watchdog (`layout-runner.ts`'s `LAYOUT_STALL_MS`, 60 s) is the first line;
 * this one is deliberately longer so main's more specific error wins whenever
 * main is alive to send it. It exists for the case where main is NOT — an
 * `ipcRenderer.invoke` whose reply never comes has no other way to end, and
 * react-query's `isLoading` (a spinner) is bound to exactly that promise.
 */
export const KNOWLEDGE_GRAPH_STALL_MS = 90_000;

function errorResult(message: string): KnowledgeResult<KnowledgeGraphPayload> {
  return { ok: false, kind: 'error', message };
}

/**
 * `knowledge.getGraph`, guaranteed to settle. Exported for its own unit test
 * (fake timers over a bridge whose `getGraph` never resolves); `useKnowledgeGraph`
 * is its only production caller.
 */
export function fetchKnowledgeGraph(
  api: MidniteStudioBridge['knowledge'],
  repoId: string,
  layoutId?: string,
  stallMs: number = KNOWLEDGE_GRAPH_STALL_MS,
): Promise<KnowledgeResult<KnowledgeGraphPayload>> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: KnowledgeResult<KnowledgeGraphPayload>): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
      resolve(result);
    };

    const arm = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        finish(
          errorResult(
            `No answer from the app for ${Math.round(stallMs / 1000)}s while loading the graph. ` +
              'Retry, or check logs/main.log for [knowledge] entries.',
          ),
        );
      }, stallMs);
    };

    const unsubscribe = api.onLayoutProgress((event) => {
      if (event.repoId === repoId) arm();
    });
    arm();

    let call: Promise<KnowledgeResult<KnowledgeGraphPayload> | undefined>;
    try {
      call = Promise.resolve(api.getGraph({ repoId, layoutId }));
    } catch (error) {
      finish(errorResult(error instanceof Error ? error.message : 'Unable to load knowledge graph.'));
      return;
    }
    call.then(
      (result) => finish(result ?? errorResult('No bridge available.')),
      (error: unknown) =>
        finish(errorResult(error instanceof Error ? error.message : 'Unable to load knowledge graph.')),
    );
  });
}

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
 *
 * `refetch` is the Retry the view offers on an error (and on a load that has
 * run long): with `staleTime: Infinity` an error envelope is cached like any
 * other answer, so without it a one-off failure would be pinned for the
 * renderer's lifetime.
 */
export function useKnowledgeGraph(
  repoId: string | null,
  /**
   * The layout to request on the INITIAL load of this repo (Phase 89 Theme
   * E) — read once per `repoId` (react-query's `queryFn` only runs again on
   * a key change or an explicit `refetch`), so a later layout switch must go
   * through `use-knowledge-layout-switch.ts` instead of changing this prop;
   * changing it alone does nothing once the query has already run. Omit for
   * the desktop handler's own default (`force-atlas2`).
   */
  layoutId?: string,
): {
  state: KnowledgeViewState;
  refetch: () => void;
} {
  const { data, isLoading, refetch } = useQuery({
    queryKey: keys.knowledgeGraph(repoId ?? 'none'),
    enabled: repoId !== null,
    queryFn: async (): Promise<KnowledgeResult<KnowledgeGraphPayload>> => {
      const api = bridge()?.knowledge;
      if (!api) return errorResult('No bridge available.');
      return fetchKnowledgeGraph(api, repoId as string, layoutId);
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
