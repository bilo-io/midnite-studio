import {
  emptyCompanionSnapshot,
  type CompanionSnapshot,
  type ForgePullsResult,
  type ForgeRunsResult,
  type RepoDescriptor,
  type StatusResult,
} from '@midnite/studio-shared';

import { dispatchMcpCall, type McpDispatchResult } from '../mcp/dispatch';
import { livePtyActivityCounts } from '../pty-service';

/**
 * Where the repo stands, right now — Phase 79 Theme B.
 *
 * **This handler composes; it never parses git.** Every field but the session
 * counts comes back from a Phase 57 MCP tool through `dispatchMcpCall`, which
 * means the companion gets the same zod-validated, registry-checked,
 * size-capped answers an external agent would — with no socket round-trip, and
 * without the MCP *server* being enabled (it is off by default, and this call
 * path does not touch it). A second git parser for the companion would be a
 * second place for `-z` handling to be got wrong.
 *
 * **The forge is best-effort, and the nullability is the contract.** `gh` may
 * be missing, unauthenticated, rate-limited or simply slow, and none of those
 * may be allowed to stall a greeting: both forge calls race a
 * {@link FORGE_TIMEOUT_MS} cap, and a loser resolves the field to `null`. The
 * script then says "I couldn't reach GitHub" and carries on. A snapshot never
 * rejects.
 */

/**
 * The forge cap, from the phase doc.
 *
 * Three seconds is chosen against what it is competing with, not against
 * `gh`'s own latency: this runs before the companion's first spoken sentence,
 * and a greeting that arrives four seconds after the panel opens reads as a
 * broken feature rather than a slow network.
 */
export const FORGE_TIMEOUT_MS = 3000;

export type CompanionSnapshotDeps = {
  /** Injected so tests can hand in a failing or slow forge without a real `gh`. */
  dispatch: (tool: string, input: unknown) => Promise<McpDispatchResult>;
  /** Live pty counts. Injected for the same reason — a test has no ptys. */
  sessionCounts: () => { live: number; thinking: number; waiting: number };
  forgeTimeoutMs?: number;
};

export const defaultSnapshotDeps: CompanionSnapshotDeps = {
  dispatch: dispatchMcpCall,
  sessionCounts: livePtyActivityCounts,
};

/** Resolve `value` to `null` if it has not settled within `ms`. Never rejects. */
async function withCap<T>(value: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      value.catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
        // The cap must never be the thing that holds the process open — a
        // quit racing an in-flight `gh` would otherwise wait it out.
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** The `value` of a successful dispatch, or `null` for any failure arm. */
function valueOf(result: McpDispatchResult | null): unknown {
  return result !== null && result.ok ? result.value : null;
}

export async function buildCompanionSnapshot(
  req: { repoPath: string | null },
  deps: CompanionSnapshotDeps = defaultSnapshotDeps,
): Promise<CompanionSnapshot> {
  const cap = deps.forgeTimeoutMs ?? FORGE_TIMEOUT_MS;
  const sessions = deps.sessionCounts();

  const repos = (valueOf(await deps.dispatch('repo.list', {})) as RepoDescriptor[] | null) ?? [];
  const base = { ...emptyCompanionSnapshot(repos.length), sessions };

  // No repo named (none open, or a window that has not selected one yet).
  // Still a valid snapshot: `repos` is what the "shall I open one?" branch of
  // the script reads.
  if (req.repoPath === null) return base;

  const resolved = valueOf(await deps.dispatch('repo.resolve', { repoPath: req.repoPath })) as {
    repo: RepoDescriptor;
    branch: string | null;
  } | null;
  // A path the registry refuses is not an error the companion reports — it is
  // the same answer as "no repo": the app has nothing open there.
  if (resolved === null) return base;

  const status = valueOf(
    await deps.dispatch('status.get', { repoPath: req.repoPath }),
  ) as StatusResult | null;

  /*
    The same partition `status-panel.tsx` draws, counted rather than listed: a
    path can be staged AND unstaged at once (porcelain v2's two axes), so these
    three numbers deliberately do not sum to a file count. `untracked` is its
    own number because git's diff never sees those files, and "you have four
    untracked files" is a different sentence from "you have four changes".
  */
  const entries = status?.entries ?? [];
  const dirty = {
    staged: entries.filter((entry) => entry.staged !== 'unmodified').length,
    unstaged: entries.filter(
      (entry) => entry.unstaged !== 'unmodified' && entry.unstaged !== 'untracked',
    ).length,
    untracked: entries.filter((entry) => entry.unstaged === 'untracked').length,
  };

  /*
    Both forge calls at once, both capped. Sequential would make the worst case
    two timeouts deep — six seconds before a greeting — for two answers that
    have nothing to do with each other.
  */
  const [pulls, checks] = await Promise.all([
    withCap(deps.dispatch('forge.pulls', { repoPath: req.repoPath, state: 'open' }), cap),
    withCap(deps.dispatch('forge.checks', { repoPath: req.repoPath }), cap),
  ]);

  const pullsValue = valueOf(pulls) as ForgePullsResult | null;
  const checksValue = valueOf(checks) as (ForgeRunsResult & { verdict: unknown }) | null;

  return {
    repo: resolved.repo,
    repos: repos.length,
    branch: resolved.branch ?? status?.branch.head ?? null,
    ahead: status?.branch.ahead ?? 0,
    behind: status?.branch.behind ?? 0,
    dirty,
    sessions,
    /*
      `cli.ready === false` (no `gh`, or not logged in) and a non-null `error`
      both mean "I could not reach GitHub", and both have to read as `null`
      rather than 0 — "no open pull requests" is a claim, and this code does
      not know it.
    */
    openPulls: forgeCount(pullsValue, (result) => result.pulls.length),
    /*
      Three conclusions count as failing, not one: `failure`, `timed_out` and
      `startup_failure` are all "CI did not pass" to a human, while
      `cancelled`/`skipped`/`neutral`/`stale` are not. `action_required` is
      deliberately excluded — it is a run waiting on a person, which the
      script has nothing useful to say about yet.
    */
    failingChecks: forgeCount(
      checksValue,
      (result) => result.runs.filter((run) => FAILING_CONCLUSIONS.has(run.conclusion ?? '')).length,
    ),
  };
}

const FAILING_CONCLUSIONS: ReadonlySet<string> = new Set([
  'failure',
  'timed_out',
  'startup_failure',
]);

/**
 * A count from a forge result, or `null` for every arm that means "could not
 * reach it".
 *
 * `cli.reason` rather than a boolean because that is how `ForgeCliStatus` is
 * modelled (three failures needing three different sentences) — the companion
 * collapses all three to `null`, since "I couldn't reach GitHub" is the one
 * sentence it has, but the collapse happens here rather than in the schema.
 */
function forgeCount<T extends { cli: { reason: string }; error: string | null }>(
  result: T | null,
  count: (result: T) => number,
): number | null {
  if (result === null) return null;
  if (result.cli.reason !== 'ready') return null;
  if (result.error !== null) return null;
  return count(result);
}
