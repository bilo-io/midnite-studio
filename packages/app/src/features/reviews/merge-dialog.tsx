import type { ForgeMergeMethod, ForgePullDetail } from '@midnite/git-shared';
import { AlertTriangle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Spinner } from '../../components/skeleton';

/**
 * The confirm in front of the one irreversible thing this app does.
 *
 * A dialog of its own rather than the shared `ConfirmDialog`, and the reason is
 * the picker. `ConfirmDialog` asks one question — "still want to?" — and its
 * whole design is that the answer is a single click on a control whose blast
 * radius is already stated. A merge asks two questions, and the second one
 * ("merge, squash or rebase?") changes what the first one means: squashing
 * fourteen commits and merging them are different outcomes with the same
 * button. Threading a form slot through the shared dialog would make every
 * other confirm in the app carry a hole for it.
 *
 * What it does keep from `ConfirmDialog` is the part that matters: the alarming
 * ring, the tinted header, the glyph, Escape-to-cancel, and a blast radius
 * stated as a **number with examples** rather than as "are you sure". See that
 * component's own doc comment — the number is the entire point.
 *
 * **Nothing is preselected.** The method starts null and Merge stays disabled
 * until a human picks one. The contract refuses a method-less merge for the
 * same reason (`ForgePullMergeRequest.method` has no default): the app must not
 * squash a history someone meant to preserve because a field went unset.
 */
const METHODS: { id: ForgeMergeMethod; label: string; hint: string }[] = [
  {
    id: 'merge',
    label: 'Merge commit',
    hint: 'Keeps every commit and adds a merge commit above them.',
  },
  {
    id: 'squash',
    label: 'Squash and merge',
    hint: 'Replaces the branch with one commit. The individual commits are not kept.',
  },
  {
    id: 'rebase',
    label: 'Rebase and merge',
    hint: 'Replays each commit onto the base branch. No merge commit, new shas.',
  },
];

export function MergeDialog({
  pullNumber,
  title,
  baseBranch,
  detail,
  pending,
  error,
  onCancel,
  onMerge,
}: {
  pullNumber: number;
  title: string;
  baseBranch: string;
  /**
   * The PR's detail, for the commit count and its sample.
   *
   * Nullable because it can still be in flight — and when it is, the dialog
   * says the count is unknown rather than showing a confident zero. A blast
   * radius that reads "0 commits" for a fourteen-commit branch is worse than no
   * blast radius at all, which is the same rule `ConfirmDialog` encodes by
   * letting `blastRadius` be `undefined` while it is being counted.
   */
  detail: ForgePullDetail | null;
  pending: boolean;
  /** `gh`'s own words when a previous attempt was refused. */
  error: string | null;
  onCancel: () => void;
  onMerge: (method: ForgeMergeMethod) => void;
}) {
  const [method, setMethod] = useState<ForgeMergeMethod | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    // Focus Cancel, matching `ConfirmDialog`: for a destructive action the safe
    // option is the one a stray Return should hit. Here it is doubly true —
    // Merge is not even reachable by Return until a method has been chosen.
    cancelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  const count = detail?.commitCount ?? null;
  const sample = detail?.commits ?? [];

  return (
    <div
      className="fixed inset-0 z-dialog flex items-center justify-center bg-background/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Merge pull request #${pullNumber}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-destructive/60 bg-popover shadow-xl ring-1 ring-destructive/30">
        <header className="flex items-start gap-2.5 border-b border-destructive/40 bg-destructive/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Merge #{pullNumber}?</h2>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={title}>
              {title}
            </p>
          </div>
        </header>

        <div className="flex flex-col gap-3 px-4 py-3">
          {/*
            The blast radius, in the shape ConfirmDialog established: a count
            first, then enough of a sample to make the count recognisable. The
            count comes from GitHub rather than a local `rev-list` — a PR's head
            ref is usually not in this checkout at all, and `rev-list` against a
            ref that is not there reads as zero.
          */}
          <p className="text-xs leading-relaxed" data-testid="merge-blast-radius">
            {count === null ? (
              <span className="text-muted-foreground">Counting the commits to be merged…</span>
            ) : (
              <>
                <span className="font-semibold tabular-nums">{count}</span>{' '}
                {count === 1 ? 'commit' : 'commits'} will land on{' '}
                <span className="text-foreground">{baseBranch || 'the base branch'}</span>. This
                cannot be undone from this app.
              </>
            )}
          </p>

          {sample.length > 0 ? (
            <ul className="flex flex-col gap-0.5 rounded border border-border bg-muted/30 px-2 py-1.5">
              {sample.map((commit) => (
                <li key={commit.sha} className="flex gap-2 text-[11px]">
                  <code className="shrink-0 text-muted-foreground">{commit.sha.slice(0, 7)}</code>
                  <span className="truncate">{commit.subject}</span>
                </li>
              ))}
              {count !== null && count > sample.length ? (
                <li className="text-[11px] text-muted-foreground">
                  …and {count - sample.length} more
                </li>
              ) : null}
            </ul>
          ) : null}

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-xs font-medium">How should it be merged?</legend>
            {METHODS.map(({ id, label, hint }) => (
              <label
                key={id}
                className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 text-xs hover:bg-accent/40"
              >
                <input
                  type="radio"
                  name="merge-method"
                  value={id}
                  checked={method === id}
                  onChange={() => setMethod(id)}
                  className="mt-0.5 accent-[hsl(var(--destructive))]"
                />
                <span className="min-w-0">
                  <span className="block">{label}</span>
                  <span className="block text-[11px] leading-relaxed text-muted-foreground">
                    {hint}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          {error !== null ? (
            <p role="alert" className="text-[11px] leading-relaxed text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex justify-end gap-2 border-t border-border px-4 py-2.5">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            // Disabled until a method is chosen — see the doc comment. The
            // pending guard is separate: a double-click on Merge would
            // otherwise send a second `gh pr merge` at a PR the first one is
            // already merging.
            disabled={method === null || pending}
            onClick={() => {
              if (method !== null) onMerge(method);
            }}
            className="inline-flex items-center gap-1.5 rounded bg-destructive px-2.5 py-1 text-xs font-medium text-destructive-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? (
              <>
                {/*
                  The one write in the app worth watching spin: a merge is
                  irreversible and `gh pr merge` is slow enough that a button
                  which only dims reads as one that did not take the click.
                */}
                <Spinner className="size-3 border-destructive-foreground/30 border-r-destructive-foreground border-t-destructive-foreground" />
                Merging…
              </>
            ) : (
              'Merge'
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}
