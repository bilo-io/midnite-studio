import { z } from 'zod';

/**
 * Repository statistics — one payload behind every dashboard widget.
 *
 * A single envelope rather than seven channels, because the widgets are seven
 * views of **one traversal**. Splitting them would mean the calendar, the
 * contributor table and the activity feed each walking the same history
 * separately, which on a large repository is the difference between a dashboard
 * that opens and one that hangs.
 *
 * Everything derived here is read-only and cheap to be wrong about — these are
 * summaries for a person to glance at, not numbers anything acts on. Where a
 * figure cannot be computed it is `null` rather than 0, the same rule the
 * metrics contract follows: "we did not measure this" and "this is zero" are
 * different statements and the UI renders them differently.
 */

/**
 * How far back the traversal reaches.
 *
 * A closed set rather than a free-form date because it is part of a cache key,
 * and an arbitrary range would make every widget a cache miss. `all` is offered
 * knowing it is the one that can hit the row cap.
 */
export const StatsWindowSchema = z.enum(['30d', '90d', '1y', 'all']);
export type StatsWindow = z.infer<typeof StatsWindowSchema>;

/** Days per window, for building `--since`. `all` has no bound. */
export const STATS_WINDOW_DAYS: Record<StatsWindow, number | null> = {
  '30d': 30,
  '90d': 90,
  '1y': 365,
  all: null,
};

/**
 * One cell of the contribution heatmap.
 *
 * `date` is a **local** `YYYY-MM-DD`, already bucketed in main. Git's `%at` is a
 * UTC epoch, and bucketing it as UTC pushes an 11pm commit into tomorrow —
 * which is precisely the cell a heatmap draws, so the error is visible as a
 * commit appearing on a day the author did not work.
 */
export const CalendarDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().int().nonnegative(),
});
export type CalendarDay = z.infer<typeof CalendarDaySchema>;

/**
 * One person, aggregated by **email** and labelled with their most recent name.
 *
 * Identities change names — marriage, transliteration, a laptop configured
 * once and forgotten — and a leaderboard keyed on the name string splits one
 * person into three entries that each look like a stranger. Keying on email and
 * showing the latest name is what makes the table describe people.
 */
export const ContributorStatSchema = z.object({
  email: z.string(),
  name: z.string(),
  commits: z.number().int().nonnegative(),
  /** Null when churn was not requested — not zero. */
  insertions: z.number().int().nonnegative().nullable(),
  deletions: z.number().int().nonnegative().nullable(),
  firstAt: z.number().int(),
  lastAt: z.number().int(),
});
export type ContributorStat = z.infer<typeof ContributorStatSchema>;

/** A commit, flattened for the activity feed. */
export const ActivityEntrySchema = z.object({
  sha: z.string(),
  at: z.number().int(),
  authorName: z.string(),
  authorEmail: z.string(),
  subject: z.string(),
});
export type ActivityEntry = z.infer<typeof ActivityEntrySchema>;

/**
 * One commit, reduced to when it happened and how much it moved — the row the
 * activity timeline buckets.
 *
 * Distinct from `ActivityEntry`, which is a **feed** (names, subjects, capped
 * at a glanceable 50): a timeline needs every commit in the window or its
 * buckets lie, and needs nothing about any of them but the numbers. Counts are
 * null when churn was not requested — "not measured", not zero, the same rule
 * `ContributorStat` follows.
 */
export const TimelineCommitSchema = z.object({
  sha: z.string(),
  /** Unix **seconds**, exactly as `%at` gives it. */
  at: z.number().int(),
  additions: z.number().int().nonnegative().nullable(),
  deletions: z.number().int().nonnegative().nullable(),
});
export type TimelineCommit = z.infer<typeof TimelineCommitSchema>;

/** A file and how much it moved. */
export const ChurnFileSchema = z.object({
  path: z.string(),
  insertions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  /** Commits that touched it — a file changed once by 900 lines is not "hot". */
  commits: z.number().int().nonnegative(),
});
export type ChurnFile = z.infer<typeof ChurnFileSchema>;

export const ChurnStatsSchema = z.object({
  files: z.array(ChurnFileSchema),
  /** Files beyond the reported top-N, so the widget can say what it withheld. */
  withheld: z.number().int().nonnegative(),
});
export type ChurnStats = z.infer<typeof ChurnStatsSchema>;

/**
 * The repository's own condition, as opposed to what people did in it.
 *
 * Stale and merged are **separate counts on purpose**. They answer different
 * questions — "nobody has touched this in months" and "this is already in the
 * default branch, so deleting it loses nothing" — and a branch can be either,
 * both, or neither. Collapsing them into one "stale" number would make the
 * actionable case (merged) indistinguishable from the merely quiet one.
 */
export const RepoHealthSchema = z.object({
  localBranches: z.number().int().nonnegative(),
  remoteBranches: z.number().int().nonnegative(),
  tags: z.number().int().nonnegative(),
  /** Local branches with no commit inside STALE_BRANCH_DAYS. */
  staleByAge: z.number().int().nonnegative(),
  /** Local branches already contained in the default branch. */
  mergedBranches: z.number().int().nonnegative(),
  /** Committer date of the oldest un-merged local branch. Null when there is none. */
  oldestUnmergedAt: z.number().int().nullable(),
  /** From `count-objects -vH`. Null when it could not be read. */
  sizeBytes: z.number().nonnegative().nullable(),
  looseObjects: z.number().int().nonnegative().nullable(),
});
export type RepoHealth = z.infer<typeof RepoHealthSchema>;

/** A branch with no commit in this many days counts as stale by age. */
export const STALE_BRANCH_DAYS = 90;

export const RepoStatsSchema = z.object({
  repoId: z.string(),
  window: StatsWindowSchema,
  /** Unix millis the traversal ran, so a widget can say how fresh it is. */
  generatedAt: z.number().int(),
  /**
   * The traversal hit its row cap or its timing budget and stopped early.
   *
   * Carried rather than swallowed: a partial year presented as a whole year is
   * a confidently wrong answer, and every widget reading this envelope needs to
   * be able to say "showing the last N" instead. Same rule as the graph
   * stream's own `truncated`.
   */
  truncated: z.boolean(),
  commitsScanned: z.number().int().nonnegative(),
  calendar: z.array(CalendarDaySchema),
  contributors: z.array(ContributorStatSchema),
  activity: z.array(ActivityEntrySchema),
  /** Every commit in the window as `{at, ±lines}`, newest first, capped like the scan. */
  timeline: z.array(TimelineCommitSchema),
  /** Null when churn was not requested — `--numstat` is the expensive half. */
  churn: ChurnStatsSchema.nullable(),
  health: RepoHealthSchema,
});
export type RepoStats = z.infer<typeof RepoStatsSchema>;
