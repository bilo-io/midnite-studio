import { useMutationState } from '@tanstack/react-query';

import { GIT_OP_LABEL, GIT_OP_RANK, type GitOpId } from '../../services/use-status';

/**
 * Which verb the op-progress segment renders, given the currently-pending
 * op ids. Pure so Theme H can test the rollup without a query client.
 *
 * `null` for no ops in flight. Otherwise the highest-ranked verb, with
 * `+N` appended for the rest — a 30-second rebase must not be visually
 * stomped by a 200ms fetch that happened to start later.
 */
export function opLabel(keys: GitOpId[]): string | null {
  if (keys.length === 0) return null;
  const [top, ...others] = [...keys].sort((a, b) => GIT_OP_RANK[b] - GIT_OP_RANK[a]) as [
    GitOpId,
    ...GitOpId[],
  ];
  return others.length > 0 ? `${GIT_OP_LABEL[top]} +${others.length}` : GIT_OP_LABEL[top];
}

/**
 * An indeterminate readout for whichever git write is running.
 *
 * Indeterminate on purpose: git reports no percentage through the current
 * channels, and a fake bar is a lie about progress. Not filtered to the
 * active worktree — the repositories sidebar acts on repos the user has not
 * selected, and a bar that went silent during those would read as nothing
 * happening. The verb is what is running in the app, not what is running
 * against the current checkout.
 *
 * A failed op clears silently: this segment only reads *pending* mutations,
 * so a settled one — success or failure alike — simply stops appearing. The
 * failure itself is reported at the surface the user invoked it from
 * (`sync-controls.tsx`, `ConflictBanner`, the dialogs), and a second report
 * at the far edge of the window would only repeat it.
 */
export function OpProgressSegment() {
  const keys = useMutationState({
    filters: { mutationKey: ['git-op'], status: 'pending' },
    select: (mutation) => mutation.options.mutationKey?.[1] as GitOpId | undefined,
  }).filter((key): key is GitOpId => key !== undefined);

  const label = opLabel(keys);
  if (label === null) return null;

  return (
    <span data-testid="status-segment-op-progress" className="text-muted-foreground">
      {label}
    </span>
  );
}
