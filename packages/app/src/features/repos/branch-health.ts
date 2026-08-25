import type { Ref, StatusResult } from '@midnite/git-shared';

/**
 * The red/amber/green reading behind a branch's status dot.
 *
 * `unknown` is not a failure state and not a fourth colour to be avoided — it
 * is the honest answer for almost every branch today, and the dot renders it as
 * the plain neutral marker the sidebar has always had. Only a level the app can
 * actually justify earns a colour.
 */
export type HealthLevel = 'unknown' | 'ok' | 'warn' | 'fail';

export type BranchHealth = {
  level: HealthLevel;
  /** Shown on hover. Always says what the colour is claiming, in words. */
  reason: string;
};

/**
 * A checks verdict from outside git — a test run, a CI pipeline.
 *
 * The seam, deliberately narrow: `checkHealth` is the whole contract a future
 * provider has to satisfy, and nothing supplies one yet (see
 * todo/outstanding.md → "Branch checks"). Keeping it as an argument rather than
 * a lookup inside this module is what lets the sidebar stay honest in the
 * meantime: with no provider, every branch that git has nothing to say about
 * reports `unknown` and shows no dot at all, rather than a green one asserting
 * a test suite nobody ran.
 */
export type ChecksVerdict = {
  level: Exclude<HealthLevel, 'unknown'>;
  /** e.g. "3 of 3 checks passed" — the provider's own wording. */
  summary: string;
};

/** Ranked worst-first, so a merge conflict outranks a passing pipeline. */
const RANK: Record<HealthLevel, number> = { fail: 3, warn: 2, ok: 1, unknown: 0 };

const worst = (a: BranchHealth, b: BranchHealth): BranchHealth =>
  RANK[b.level] > RANK[a.level] ? b : a;

/**
 * What the working tree of a checkout says about it.
 *
 * Scoped to a *checkout*, not a branch: uncommitted changes and a paused rebase
 * belong to a worktree, and the same branch checked out somewhere else has its
 * own. A clean tree deliberately reports `unknown` rather than `ok` — "no
 * problems in the working tree" is not a green light about the code, and a
 * sidebar full of green dots that mean "you have not edited anything" would
 * make a real green light unreadable.
 */
export function worktreeHealth(status: StatusResult | undefined | null): BranchHealth {
  if (!status) return { level: 'unknown', reason: '' };

  if (status.inProgress !== null) {
    return { level: 'fail', reason: `${status.inProgress} in progress` };
  }

  const conflicted = status.entries.filter((entry) => entry.conflicted).length;
  if (conflicted > 0) {
    return { level: 'fail', reason: `${conflicted} conflicted ${plural(conflicted, 'file')}` };
  }

  // A path can be staged AND unstaged at once, so this counts paths, not edits.
  const changed = status.entries.length;
  if (changed > 0) {
    return { level: 'warn', reason: `${changed} uncommitted ${plural(changed, 'change')}` };
  }

  return { level: 'unknown', reason: 'Working tree clean' };
}

/**
 * The dot for one branch row: its checkout's state, its upstream, and whatever
 * a checks provider has to say, reduced to the worst of them.
 */
export function branchHealth(input: {
  ref: Ref;
  /** Status of the checkout this branch is live in, when the app has it. */
  status?: StatusResult | null;
  checks?: ChecksVerdict | undefined;
}): BranchHealth {
  const { ref, status, checks } = input;

  let health: BranchHealth = { level: 'unknown', reason: '' };

  // Only the checkout's OWN status may speak for it. `status` belongs to the
  // primary checkout; attributing it to a branch living in another worktree
  // would report that worktree's cleanliness against the wrong row.
  if (ref.isHead) health = worst(health, worktreeHealth(status));

  if (ref.upstream?.gone === true) {
    health = worst(health, { level: 'warn', reason: 'Upstream branch is gone' });
  }

  if (checks) health = worst(health, { level: checks.level, reason: checks.summary });

  return health;
}

const plural = (count: number, word: string): string => (count === 1 ? word : `${word}s`);
