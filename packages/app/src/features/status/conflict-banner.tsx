import type { InProgressOp, StatusResult } from '@midnite/git-shared';

import { useGitOp } from '../../services/use-status';

/**
 * The banner shown whenever git is paused mid-operation.
 *
 * Always visible while `status.inProgress` is set, in every view — not tucked
 * into the changes panel. A half-finished rebase changes what every other
 * action means, and the single worst state a git client can leave someone in is
 * "something is wrong and I can't find the way out". Abort is therefore never
 * disabled: it is git's own restore path and it always works.
 *
 * Continue is disabled while anything is still unmerged, with the count shown,
 * because clicking it in that state can only produce an error.
 */
/**
 * Exported so the status bar's mid-operation segment can render the exact
 * same word rather than a second map that could drift from this one.
 */
export const INPROGRESS_LABEL: Record<InProgressOp, string> = {
  merge: 'Merge',
  rebase: 'Rebase',
  'cherry-pick': 'Cherry-pick',
  revert: 'Revert',
};

export function ConflictBanner({
  status,
  onError,
}: {
  status: StatusResult;
  onError: (message: string) => void;
}) {
  const op = status.inProgress;

  const abortOp = useGitOp<InProgressOp>('abort', (api, value, ctx) =>
    api.ops.abort({ ...ctx, op: value }),
  );
  const continueOp = useGitOp<InProgressOp>('continue', (api, value, ctx) =>
    api.ops.continue({ ...ctx, op: value }),
  );

  if (!op) return null;

  const conflicted = status.entries.filter((entry) => entry.conflicted);
  const busy = abortOp.isPending || continueOp.isPending;

  const run = async (mutate: () => Promise<{ ok: boolean; kind?: string; message?: string }>) => {
    const result = await mutate();
    if (result.ok) onError('');
    else if (result.kind === 'error') onError(result.message ?? 'The operation failed.');
    else onError('');
  };

  return (
    <div className="shrink-0 border-b border-destructive/40 bg-destructive/10 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-destructive">{INPROGRESS_LABEL[op]} in progress</span>
        <span className="text-xs text-muted-foreground">
          {conflicted.length > 0
            ? `${conflicted.length} file${conflicted.length === 1 ? '' : 's'} still conflicted`
            : 'conflicts resolved — ready to continue'}
        </span>

        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            disabled={busy || conflicted.length > 0}
            title={
              conflicted.length > 0
                ? 'Resolve and stage every conflicted file first.'
                : `Continue the ${op}`
            }
            onClick={() => void run(() => continueOp.mutateAsync(op))}
            className="rounded bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
          >
            Continue
          </button>
          {/* Never disabled — the way out must always be available. */}
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => abortOp.mutateAsync(op))}
            className="rounded border border-border px-2 py-0.5 text-xs disabled:opacity-40"
          >
            Abort
          </button>
        </span>
      </div>

      {conflicted.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5">
          {conflicted.slice(0, 8).map((entry) => (
            <li key={entry.path} className="truncate text-xs text-muted-foreground">
              {entry.path}
            </li>
          ))}
          {conflicted.length > 8 ? (
            <li className="text-xs text-muted-foreground">
              …and {conflicted.length - 8} more
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
