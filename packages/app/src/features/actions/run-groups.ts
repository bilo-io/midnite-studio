import type { ForgeRun } from '@midnite/studio-shared';

/**
 * Runs, sectioned by the workflow that produced them.
 *
 * Keyed on `workflowId`, never the display name. A workflow's name is whatever
 * `name:` says in the yaml this morning, so grouping by it splits one
 * workflow's history in two the day somebody renames it — and merges two
 * workflows that happen to share a name. The id is the thing that does not move.
 */
export type RunGroup = {
  /** `workflowId` when the forge gave one; otherwise a name-derived fallback. */
  key: string;
  label: string;
  runs: ForgeRun[];
};

/**
 * The conclusions that mean "somebody needs to look at this".
 *
 * Deliberately narrower than "not success": `cancelled` and `skipped` are
 * things a human or an `if:` decided on purpose, and opening the view on one of
 * those instead of the actual failure two rows down would be worse than opening
 * on nothing.
 */
export const isFailure = (run: ForgeRun): boolean =>
  run.status === 'completed' &&
  (run.conclusion === 'failure' ||
    run.conclusion === 'startup_failure' ||
    run.conclusion === 'timed_out');

/** Newest first, by the only timestamp every run is guaranteed to carry. */
const newestFirst = (a: ForgeRun, b: ForgeRun): number => b.createdAt.localeCompare(a.createdAt);

/**
 * Group a flat run listing.
 *
 * Groups are ordered by their own newest run, so the workflow that ran most
 * recently is at the top — which is the question the view is usually being
 * asked. Within a group, newest first for the same reason.
 */
export function groupRuns(runs: readonly ForgeRun[]): RunGroup[] {
  const groups = new Map<string, RunGroup>();

  for (const run of runs) {
    const key = run.workflowId ?? `name:${run.workflowName ?? run.name}`;
    const existing = groups.get(key);
    if (existing) existing.runs.push(run);
    else groups.set(key, { key, label: run.workflowName ?? run.name, runs: [run] });
  }

  const ordered = [...groups.values()];
  for (const group of ordered) group.runs.sort(newestFirst);
  ordered.sort((a, b) => {
    const [first] = a.runs;
    const [second] = b.runs;
    if (!first || !second) return 0;
    return newestFirst(first, second);
  });
  return ordered;
}

/**
 * Which run the view should open on.
 *
 * The newest failing one, because that is almost always why the view was
 * opened — and the newest run of any kind when everything passed, so a
 * repository with CI never shows a blank pane. `null` only for a repository
 * with no runs at all, which has its own empty state to render.
 */
export function pickInitialRun(runs: readonly ForgeRun[]): string | null {
  const ordered = [...runs].sort(newestFirst);
  return (ordered.find(isFailure) ?? ordered[0])?.id ?? null;
}

/**
 * Which jobs open expanded.
 *
 * The failed ones, and only them. A successful job's step list is thirty rows
 * of green that push the one red row off the screen, and the failure is the
 * entire reason the pane is open. When nothing failed there is nothing to lead
 * with, so everything stays collapsed and the tree is a summary.
 */
export const shouldExpandJob = (job: {
  status: ForgeRun['status'];
  conclusion: ForgeRun['conclusion'];
}): boolean =>
  job.status === 'completed' &&
  (job.conclusion === 'failure' ||
    job.conclusion === 'startup_failure' ||
    job.conclusion === 'timed_out');

/**
 * How long a run or job took, as a human reads it.
 *
 * Returns null rather than "0s" when either end is missing: a queued run has no
 * start, and a duration invented for it would claim it ran instantly.
 */
export function duration(from: string | null, to: string | null): string | null {
  if (from === null || to === null) return null;
  const ms = Date.parse(to) - Date.parse(from);
  if (!Number.isFinite(ms) || ms < 0) return null;

  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * Relative age, to the day.
 *
 * Coarse on purpose — the run list is scanned, not read, and "3d" tells you
 * what you need at a glance where a timestamp would need parsing. `now` is a
 * parameter so this stays pure and testable.
 */
export function relativeAge(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}
