import { resolveRevision } from '../../services/queries';
import { useUiStore } from '../../store/ui-store';
import { useGraphStore } from './graph-store';

/**
 * Phase 112 Theme C — `revealCommit`, a reveal that always lands.
 *
 * The graph streams its log into `useGraphStore` rather than paging, so
 * "paging in" is waiting for the stream to deliver the row, bounded by the
 * stream's own row cap (`truncated`). Three ways a row can be missing, each
 * answered rather than silently ignored:
 *
 *   - still streaming: wait for it (bounded by `timeoutMs`);
 *   - hidden by a ref filter: clear the filter, restream, wait again, and say
 *     so — the user asked to see the commit, not to keep the filter;
 *   - older than the cap: `not-found`, pointing at Search.
 *
 * Landing is `selectCommit(sha)` plus `pulseCommit` — `GraphView` centres the
 * row and plays the one-shot pulse (a no-op under the motion policy).
 */

export const COMMIT_BEYOND_CAP_SAY =
  'That commit is older than the graph has loaded — search for it instead.';

export type RevealCommitResult =
  | { ok: true; sha: string; clearedFilter: boolean }
  | { ok: false; say: string };

export type RevealCommitDeps = {
  resolve: (repoId: string, rev: string) => Promise<string | null>;
  /** How long to wait for a row to stream in before giving up. */
  timeoutMs: number;
};

const LIVE_DEPS: RevealCommitDeps = { resolve: resolveRevision, timeoutMs: 20_000 };

type Wait = 'found' | 'settled' | 'timeout';

/**
 * Resolves when the row is in the store (`found`), when the stream for this
 * repo has finished without it (`settled`, optionally only a stream newer than
 * `after`), or when the time runs out.
 */
function waitForRow(repoId: string, sha: string, timeoutMs: number, after: string | null): Promise<Wait> {
  return new Promise((resolve) => {
    const timer: { id?: ReturnType<typeof setTimeout> } = {};
    const subscription: { off?: () => void } = {};
    const done = (outcome: Wait) => {
      if (timer.id !== undefined) clearTimeout(timer.id);
      subscription.off?.();
      resolve(outcome);
    };
    const check = (): boolean => {
      const state = useGraphStore.getState();
      if (state.repoId !== repoId) return false;
      if (state.rows.some((row) => row.commit.sha === sha)) {
        done('found');
        return true;
      }
      if (!state.loading && state.requestId !== null && state.requestId !== after) {
        done('settled');
        return true;
      }
      return false;
    };
    if (check()) return;
    subscription.off = useGraphStore.subscribe(() => {
      check();
    });
    timer.id = setTimeout(() => done('timeout'), timeoutMs);
  });
}

export async function revealCommit(
  repoId: string,
  rev: string,
  options: { refFullName?: string | null } = {},
  deps: RevealCommitDeps = LIVE_DEPS,
): Promise<RevealCommitResult> {
  const sha = await deps.resolve(repoId, rev);
  if (sha === null) return { ok: false, say: "I can't find that commit in this repository." };

  let outcome = await waitForRow(repoId, sha, deps.timeoutMs, null);
  let clearedFilter = false;

  if (outcome !== 'found') {
    const ui = useUiStore.getState();
    if (ui.graphRefFilter.length > 0) {
      clearedFilter = true;
      const previous = useGraphStore.getState().requestId;
      ui.setGraphRefFilter([]);
      outcome = await waitForRow(repoId, sha, deps.timeoutMs, previous);
    }
  }

  if (outcome !== 'found') {
    if (outcome === 'timeout') {
      return { ok: false, say: 'The graph is still loading — try again in a moment.' };
    }
    return {
      ok: false,
      say: useGraphStore.getState().truncated
        ? COMMIT_BEYOND_CAP_SAY
        : "That commit isn't reachable from anything the graph shows — search for it instead.",
    };
  }

  useUiStore.getState().selectCommit(sha);
  useGraphStore.getState().pulseCommit(sha, options.refFullName ?? null);
  return { ok: true, sha, clearedFilter };
}
