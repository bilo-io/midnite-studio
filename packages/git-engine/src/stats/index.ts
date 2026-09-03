import {
  STATS_WINDOW_DAYS,
  type RepoStats,
  type StatsWindow,
} from '@midnite/studio-shared';

import { execGit } from '../exec/git-exec';
import { buildCalendar } from './calendar';
import { buildChurn } from './churn';
import { readHistory } from './commit-history';
import { buildContributors } from './contributors';
import { readHealth } from './health';
import { createStatsCache, refDigest, type StatsCache } from './stats-cache';
import { buildTimeline } from './timeline';

export * from './calendar';
export * from './churn';
export * from './commit-history';
export * from './contributors';
export * from './health';
export * from './stats-cache';
export * from './timeline';

/**
 * Repository statistics, computed once and folded many ways.
 *
 * The whole module is `electron`-free and runs under bare vitest, like the rest
 * of git-engine — the aggregators are pure functions over a commit array, and
 * only this file and `health.ts` touch a repository at all.
 */

/**
 * Hard cap on commits scanned.
 *
 * A repository with 200,000 commits must degrade to "showing the last N" rather
 * than block the main process while git streams a decade of history through a
 * regex. 20,000 is comfortably more than any window a dashboard draws
 * meaningfully, and the envelope reports when it was hit — a truncated year
 * presented as a whole year would be a confidently wrong answer.
 */
export const STATS_MAX_COMMITS = 20_000;

/** Wall-clock budget for the traversal. Exceeding it truncates, like the cap. */
export const STATS_BUDGET_MS = 8_000;

/** How many commits the activity feed carries. The rest are counted, not listed. */
export const ACTIVITY_LIMIT = 50;

export type ComputeStatsOptions = {
  repoId: string;
  repoPath: string;
  window: StatsWindow;
  /** `--numstat` is the expensive half; a board with no churn widget skips it. */
  withChurn?: boolean;
  maxCommits?: number;
  now?: () => number;
};

/** The default process-wide cache. Injectable for tests. */
const defaultCache = createStatsCache<RepoStats>();

export async function computeStats(
  options: ComputeStatsOptions,
  cache: StatsCache<RepoStats> = defaultCache,
): Promise<RepoStats> {
  const now = options.now ?? Date.now;
  const withChurn = options.withChurn ?? false;
  const maxCommits = options.maxCommits ?? STATS_MAX_COMMITS;

  const digest = await readRefDigest(options.repoPath);
  const key = {
    repoId: options.repoId,
    window: options.window,
    withChurn,
    refDigest: digest,
  };
  const hit = cache.get(key);
  if (hit) return hit;

  const days = STATS_WINDOW_DAYS[options.window];
  const started = now();

  const [history, health] = await Promise.all([
    readHistory(options.repoPath, {
      maxCommits,
      ...(days === null ? {} : { since: `${days} days ago` }),
      ...(withChurn ? { withChurn: true } : {}),
    }),
    readHealth(options.repoPath, now),
  ]);

  // The budget is checked after the fact rather than enforced mid-stream: git
  // has already done the work by the time the output arrives, so aborting
  // would waste it. What it buys is an honest `truncated` flag on a repository
  // that is slow for reasons the row cap does not describe.
  const overBudget = now() - started > STATS_BUDGET_MS;

  const stats: RepoStats = {
    repoId: options.repoId,
    window: options.window,
    generatedAt: now(),
    truncated: history.truncated || overBudget,
    commitsScanned: history.commits.length,
    calendar: buildCalendar(history.commits),
    contributors: buildContributors(history.commits),
    // Newest first — `git log` order — and capped, because an activity feed is
    // a glance at what just happened, not a second commit graph.
    activity: history.commits.slice(0, ACTIVITY_LIMIT).map((commit) => ({
      sha: commit.sha,
      at: commit.at,
      authorName: commit.authorName,
      authorEmail: commit.authorEmail,
      subject: commit.subject,
    })),
    timeline: buildTimeline(history.commits),
    // Null, not an empty table: "not requested" and "no files changed" are
    // different answers and the widget renders them differently.
    churn: withChurn ? buildChurn(history.commits) : null,
    health,
  };

  cache.set(key, stats);
  return stats;
}

/** Drop a repository's cached statistics — wired to the Phase 10 watcher. */
export function invalidateStats(repoId: string, cache: StatsCache<RepoStats> = defaultCache): void {
  cache.invalidate(repoId);
}

async function readRefDigest(repoPath: string): Promise<string> {
  const result = await execGit(repoPath, ['for-each-ref', '--format=%(objectname) %(refname)']);
  if (result.exitCode !== 0) return '';
  const rows = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const space = line.indexOf(' ');
      return { sha: line.slice(0, space), refName: line.slice(space + 1) };
    });
  return refDigest(rows);
}
