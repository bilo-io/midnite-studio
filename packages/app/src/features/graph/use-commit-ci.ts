import { useEffect, useMemo, useState } from 'react';

import type { CommitCi, ForgeCommitRunsResult, GraphRow } from '@midnite/studio-shared';
import { useQueries } from '@tanstack/react-query';

import { usePageVisible } from '../../lib/use-page-visible';
import { useWindowFocused } from '../../lib/use-window-focus';
import { bridge } from '../../services/bridge';
import { keys } from '../../services/queries';
import {
  CI_RANGE_DEBOUNCE_MS,
  CI_STALE_MS,
  ciPollInterval,
  commitCiBySha,
  visibleCiPages,
  type RowRange,
} from './commit-ci';

const EMPTY: ForgeCommitRunsResult = {
  cli: { reason: 'not-installed', binPath: null, hint: '' },
  runs: {},
  error: null,
};

/**
 * The viewport, once it has held still for {@link CI_RANGE_DEBOUNCE_MS}.
 *
 * A fling through a 50 000-row history passes over hundreds of pages in a
 * second; asking for each would queue hundreds of batches for rows nobody
 * looked at. Only a range the user actually stopped on is fetched.
 */
function useSettledRange(range: RowRange | null): RowRange | null {
  const start = range?.startIndex ?? -1;
  const end = range?.endIndex ?? -1;
  const [settled, setSettled] = useState<RowRange | null>(range);
  useEffect(() => {
    const timer = setTimeout(
      () => setSettled(start < 0 ? null : { startIndex: start, endIndex: end }),
      CI_RANGE_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [start, end]);
  return settled;
}

/**
 * CI per visible commit, for the graph's CI column.
 *
 * One query per page of {@link visibleCiPages}; each is a single batched
 * `forge.commitRuns` call answered from main's per-sha cache. The renderer's
 * own cache is react-query's: a settled page is fresh for {@link CI_STALE_MS}
 * and scrolling back to it is a hit.
 *
 * Polls only a page with a queued or running run, and only while the window
 * is focused, the document visible and the graph on screen — `enabled` is the
 * caller's "the column is showing and the graph is the active view". A blurred
 * window costs nothing, which is what `idle-cpu.mjs --blurred` measures.
 *
 * A repository with no forge, a signed-out `gh`, or an unreachable host all
 * resolve to an answer with no runs, so the column simply stays empty — no
 * error surface and no spinner.
 */
export function useCommitCi(
  repoId: string | null,
  rows: readonly GraphRow[],
  rowCount: number,
  range: RowRange | null,
  enabled: boolean,
): Map<string, CommitCi> {
  const settled = useSettledRange(range);
  const focused = useWindowFocused();
  const pageVisible = usePageVisible();
  const gateOpen = enabled && focused && pageVisible;

  const startIndex = settled?.startIndex ?? -1;
  const endIndex = settled?.endIndex ?? -1;
  const pages = useMemo(
    () =>
      enabled && repoId !== null && startIndex >= 0
        ? visibleCiPages((index) => rows[index]?.commit.sha, rowCount, { startIndex, endIndex })
        : [],
    // `rows` is the graph store's stable buffer; `rowCount` is what changes.
    [enabled, repoId, rows, rowCount, startIndex, endIndex],
  );

  const results = useQueries({
    queries: pages.map((shas) => ({
      queryKey: keys.forgeCommitRuns(repoId ?? '', shas),
      queryFn: async (): Promise<ForgeCommitRunsResult> => {
        const api = bridge();
        if (!api || repoId === null) return EMPTY;
        try {
          return await api.forge.commitRuns({ repoId, shas });
        } catch {
          // The envelope never throws; the transport can. Either way the
          // column's answer is "nothing to draw".
          return EMPTY;
        }
      },
      enabled: enabled && repoId !== null,
      staleTime: CI_STALE_MS,
      refetchInterval: (query: { state: { data: ForgeCommitRunsResult | undefined } }) =>
        ciPollInterval(query.state.data, gateOpen),
      refetchIntervalInBackground: false,
    })),
  });

  /*
    Rebuilt only when an answer actually changes. `useQueries` hands back a new
    array every render, and a fresh map every render would hand every mounted
    (memoised) row a fresh `ci` object and re-render all of them on each
    scroll frame. `dataUpdatedAt` moves exactly when a page's data does.
  */
  const signature = results.map((result, index) => `${pages[index]?.[0] ?? ''}@${result.dataUpdatedAt}`).join('|');
  const datas = results.map((result) => result.data);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => commitCiBySha(datas), [signature]);
}
