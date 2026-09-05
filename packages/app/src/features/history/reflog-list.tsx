import { useMemo, useState, type ReactNode } from 'react';

import type { Ref, ReflogAction, ReflogEntry } from '@midnite/studio-shared';

import type { IconType } from 'react-icons';
import {
  LuArrowDownToLine,
  LuArrowRightLeft,
  LuCircle,
  LuCopy,
  LuGitBranchPlus,
  LuGitCommitHorizontal,
  LuGitCompare,
  LuGitMerge,
  LuPencil,
  LuRotateCcw,
  LuUndo2,
} from 'react-icons/lu';

import { EmptyState } from '../../components/empty-state';
import { LoadingRegion, Skeleton } from '../../components/skeleton';
import { useNow } from '../../lib/use-now';
import { useReflog, useRefs } from '../../services/queries';
import { useActiveWorktree, useGitOp } from '../../services/use-status';
import { UserAvatar } from '../../components/user-avatar';
import { relativeAge } from '../actions/run-groups';

const ACTION_ICON: Record<ReflogAction, IconType> = {
  commit: LuGitCommitHorizontal,
  amend: LuPencil,
  checkout: LuArrowRightLeft,
  reset: LuRotateCcw,
  merge: LuGitMerge,
  rebase: LuGitCompare,
  cherryPick: LuCopy,
  revert: LuUndo2,
  pull: LuArrowDownToLine,
  branch: LuGitBranchPlus,
  other: LuCircle,
};

const ACTION_LABEL: Record<ReflogAction, string> = {
  commit: 'Commit',
  amend: 'Amend',
  checkout: 'Checkout',
  reset: 'Reset',
  merge: 'Merge',
  rebase: 'Rebase',
  cherryPick: 'Cherry-pick',
  revert: 'Revert',
  pull: 'Pull',
  branch: 'Branch',
  other: 'Other',
};

const ALL_ACTIONS: readonly ReflogAction[] = [
  'commit',
  'amend',
  'checkout',
  'reset',
  'merge',
  'rebase',
  'cherryPick',
  'revert',
  'pull',
  'branch',
  'other',
];

const short = (sha: string): string => sha.slice(0, 7);

const copy = (value: string): void => {
  void navigator.clipboard?.writeText(value).catch(() => undefined);
};

/**
 * "What this repository recorded" — the reflog tab beside `JournalList`
 * (Phase 22 Theme G).
 *
 * A ref selector (HEAD plus every local branch — `undefined` in the query
 * means HEAD, matching `readReflog`'s own default) and an action filter over
 * the same fetched page, applied client-side: the phase doc's `limit` is a
 * page size, not a search, so filtering server-side would mean "the 30 most
 * recent commits," not "the 30 most recent commits, of which some may be
 * resets" — the filter would silently shrink the page instead of narrowing
 * what's shown from it.
 */
export function ReflogList() {
  const { repoId, worktreePath } = useActiveWorktree();
  const { data: refs = EMPTY_REFS } = useRefs(repoId);
  const localBranches = useMemo(() => refs.filter((r) => r.kind === 'localBranch'), [refs]);

  const [selectedRef, setSelectedRef] = useState<string | undefined>(undefined);
  const [actionFilter, setActionFilter] = useState<ReflogAction | 'all'>('all');
  const now = useNow();

  const reflog = useReflog(repoId, selectedRef, worktreePath);
  const entries = reflog.data ?? EMPTY_ENTRIES;
  const checkout = useGitOp<{ target: string; detach?: boolean }>('checkout', (api, args, ctx) =>
    api.ops.checkout({ ...ctx, target: args.target, detach: args.detach ?? false }),
  );

  const filtered = useMemo(
    () => (actionFilter === 'all' ? entries : entries.filter((e) => e.action === actionFilter)),
    [entries, actionFilter],
  );

  if (repoId === null) {
    return <Centered>Select a repository to see what it has recorded.</Centered>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-2 py-1.5">
        {/*
          `htmlFor`/`id`, not a wrapping `<label>`: a `<select>`'s accessible
          name-from-content pulls in every one of its options' text (Chromium
          does this even nested inside a labelling element), so a wrapping
          label's own computed name ends up "RefHEADmainfeature" instead of
          "Ref" — unusable both for a screen reader and for `getByLabel` in a
          test. Explicit association keeps the label's name exactly its own
          text.
        */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <label htmlFor="reflog-ref">Ref</label>
          <select
            id="reflog-ref"
            value={selectedRef ?? 'HEAD'}
            onChange={(event) => setSelectedRef(event.target.value === 'HEAD' ? undefined : event.target.value)}
            className="rounded-md border border-input bg-background px-1.5 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="HEAD">HEAD</option>
            {localBranches.map((ref) => (
              <option key={ref.fullName} value={ref.fullName}>
                {ref.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <label htmlFor="reflog-action">Action</label>
          <select
            id="reflog-action"
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value as ReflogAction | 'all')}
            className="rounded-md border border-input bg-background px-1.5 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All</option>
            {ALL_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {ACTION_LABEL[action]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/*
        Error → empty → skeleton → content, in that order
        (`components/skeleton.tsx`). `git reflog` fails for real reasons — a
        ref that no longer exists, a worktree that has moved — and until Phase
        60 Theme C every one of them rendered as "No reflog entries for this
        ref.", which is a claim about the repository rather than about the
        call. The skeleton is last because a grey bar that never resolves is
        indistinguishable from one still loading.
      */}
      {reflog.isError ? (
        <EmptyState
          icon={LuRotateCcw}
          title="Could not read the reflog"
          body={reflog.error instanceof Error ? reflog.error.message : String(reflog.error)}
        />
      ) : reflog.isPending ? (
        <ReflogSkeleton />
      ) : filtered.length === 0 ? (
        <Centered>
          {entries.length === 0
            ? 'No reflog entries for this ref.'
            : 'Nothing matches this action filter.'}
        </Centered>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="Reflog">
          {filtered.map((entry) => (
            <ReflogRow
              key={entry.fullSelector}
              entry={entry}
              now={now.getTime()}
              onCheckout={() => checkout.mutate({ target: entry.sha, detach: true })}
            />
          ))}
        </ul>
      )}

      <p className="shrink-0 border-t border-border px-2 py-1.5 text-[11px] text-muted-foreground">
        git prunes unreachable reflog entries after 30 days and reachable ones after 90, by
        default — "it's in the reflog" is a time-limited promise, not a permanent one.
      </p>
    </div>
  );
}

/**
 * The reflog list, at rest — an icon, a subject and a metadata line per row,
 * which is the shape `ReflogRow` paints. Six rows because six fill the pane;
 * the count is not a claim about the page size (`components/skeleton.tsx`).
 */
function ReflogSkeleton() {
  return (
    <LoadingRegion label="Reading the reflog…" className="min-h-0 flex-1 overflow-hidden p-2">
      {[52, 66, 44, 71, 58, 49].map((width, index) => (
        <div key={width} className="flex items-start gap-2 border-b border-border/50 py-2">
          <Skeleton className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3" style={{ width: `${width}%` }} />
            <Skeleton className="h-2.5" style={{ width: index % 2 === 0 ? '34%' : '28%' }} />
          </div>
        </div>
      ))}
    </LoadingRegion>
  );
}

function ReflogRow({
  entry,
  now,
  onCheckout,
}: {
  entry: ReflogEntry;
  now: number;
  onCheckout: () => void;
}) {
  const Icon = ACTION_ICON[entry.action];

  return (
    <li className="group flex items-start gap-2 border-b border-border/50 py-2 last:border-0">
      <Icon aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{entry.subject}</p>
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <span>{relativeAge(new Date(entry.at * 1000).toISOString(), now)}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <UserAvatar name={entry.author} size={14} detail="Reflog author" />
            <span>{entry.author}</span>
          </span>
          <span>·</span>
          <button
            type="button"
            onClick={() => copy(entry.sha)}
            title="Copy sha"
            className="font-mono hover:text-foreground hover:underline"
          >
            {entry.oldSha ? `${short(entry.oldSha)} → ` : ''}
            {short(entry.sha)}
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={onCheckout}
        className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100"
      >
        Checkout
      </button>
    </li>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center p-8">
      <p className="max-w-md text-center text-sm leading-relaxed text-muted-foreground">
        {children}
      </p>
    </div>
  );
}

const EMPTY_REFS: Ref[] = [];
const EMPTY_ENTRIES: ReflogEntry[] = [];
