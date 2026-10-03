import { useMemo } from 'react';

import type { CommitDiffStat, GraphRow } from '@midnite/studio-shared';
import { useQueries } from '@tanstack/react-query';

import { bridge } from '../../services/bridge';
import { keys } from '../../services/queries';
import { visibleCiPages, type RowRange } from './commit-ci';
import { useSettledRange } from './use-commit-ci';

/**
 * Diff stat (`+added -deleted`) per visible commit, for the graph's Diff column.
 *
 * Same paging as the CI column — pages aligned to multiples of 25, only for
 * the settled viewport plus overscan, one batched `git log --numstat` per page
 * in main. A commit is immutable, so a page's answer never goes stale: it is
 * cached for the session by its sha list and scrolling back is free.
 *
 * `enabled` is the column being shown on a visible graph; off, it asks for
 * nothing. A merge commit's value is `null` (rendered as an em dash).
 */
export function useCommitStats(
  repoId: string | null,
  rows: readonly GraphRow[],
  rowCount: number,
  range: RowRange | null,
  enabled: boolean,
): Map<string, CommitDiffStat | null> {
  const settled = useSettledRange(range);
  const startIndex = settled?.startIndex ?? -1;
  const endIndex = settled?.endIndex ?? -1;
  const pages = useMemo(
    () =>
      enabled && repoId !== null && startIndex >= 0
        ? visibleCiPages((index) => rows[index]?.commit.sha, rowCount, { startIndex, endIndex })
        : [],
    [enabled, repoId, rows, rowCount, startIndex, endIndex],
  );

  const results = useQueries({
    queries: pages.map((shas) => ({
      queryKey: keys.commitStats(repoId ?? '', shas),
      queryFn: async (): Promise<Record<string, CommitDiffStat | null>> => {
        const api = bridge();
        if (!api || repoId === null) return {};
        try {
          return (await api.commitStats({ repoId, shas })).stats;
        } catch {
          return {};
        }
      },
      enabled: enabled && repoId !== null,
      staleTime: Infinity,
    })),
  });

  const signature = results.map((result, index) => `${pages[index]?.[0] ?? ''}@${result.dataUpdatedAt}`).join('|');
  const datas = results.map((result) => result.data);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => {
    const out = new Map<string, CommitDiffStat | null>();
    for (const data of datas) if (data) for (const [sha, stat] of Object.entries(data)) out.set(sha, stat);
    return out;
  }, [signature]);
}
