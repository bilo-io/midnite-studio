import {
  aggregateCommitRuns,
  hasActiveRun,
  type CommitCi,
  type ForgeCommitRunsResult,
} from '@midnite/studio-shared';

/**
 * The git graph CI column's paging and polling rules — pure, so the batching
 * and the "poll only while something moves" decision are tested without
 * mounting a 50 000-row graph.
 *
 * Aggregation itself is not here: it is `aggregateCommitRuns` in `shared`,
 * built on the same `latestPerWorkflow` rule `checksVerdict` reads, so the
 * column and every other CI verdict in the app agree about a commit.
 */

/** Shas per batched request. A page is one query and one cache entry. */
export const CI_PAGE_SIZE = 25;
/** Rows either side of the viewport whose CI is fetched before they scroll in. */
export const CI_OVERSCAN = 5;
/** How often a page with something queued or running is re-read. */
export const CI_POLL_MS = 15_000;
/** How long a settled page is served from the renderer's cache before a refetch on remount. */
export const CI_STALE_MS = 60_000;
/** How long the viewport must hold still before its pages are asked for. */
export const CI_RANGE_DEBOUNCE_MS = 250;

export type RowRange = { startIndex: number; endIndex: number };

/**
 * The pages of shas covering `range` plus {@link CI_OVERSCAN} rows either side.
 *
 * Pages are aligned to multiples of {@link CI_PAGE_SIZE}, never to the
 * viewport, so a scroll of a few rows keeps asking for the same pages — the
 * same query keys, the same cache entries — instead of a fresh batch per pixel.
 * A 50 000-commit repository therefore costs one or two batches for the rows
 * on screen, never 50 000 lookups.
 */
export function visibleCiPages(
  shaAt: (index: number) => string | undefined,
  count: number,
  range: RowRange | null,
): string[][] {
  if (range === null || count === 0) return [];
  const start = Math.max(0, range.startIndex - CI_OVERSCAN);
  const end = Math.min(count - 1, range.endIndex + CI_OVERSCAN);
  if (end < start) return [];

  const pages: string[][] = [];
  for (let page = Math.floor(start / CI_PAGE_SIZE); page <= Math.floor(end / CI_PAGE_SIZE); page++) {
    const shas: string[] = [];
    const last = Math.min(count, (page + 1) * CI_PAGE_SIZE);
    for (let index = page * CI_PAGE_SIZE; index < last; index++) {
      const sha = shaAt(index);
      if (sha !== undefined) shas.push(sha);
    }
    if (shas.length > 0) pages.push(shas);
  }
  return pages;
}

/** Whether a page has anything still queued or running. */
export const pageIsActive = (result: ForgeCommitRunsResult | undefined): boolean =>
  result !== undefined && Object.values(result.runs).some(hasActiveRun);

/**
 * A page's refetch interval: {@link CI_POLL_MS} while something on it is
 * moving and the poll gate is open (window focused, document visible, graph on
 * screen), otherwise never. A settled page — which is nearly every page — costs
 * nothing after its first read.
 */
export const ciPollInterval = (
  result: ForgeCommitRunsResult | undefined,
  gateOpen: boolean,
): number | false => (gateOpen && pageIsActive(result) ? CI_POLL_MS : false);

/** Every answered page, flattened into one aggregate per commit that has CI. */
export function commitCiBySha(results: ReadonlyArray<ForgeCommitRunsResult | undefined>): Map<string, CommitCi> {
  const out = new Map<string, CommitCi>();
  for (const result of results) {
    if (!result) continue;
    for (const [sha, runs] of Object.entries(result.runs)) {
      const ci = aggregateCommitRuns(runs);
      if (ci) out.set(sha, ci);
    }
  }
  return out;
}
