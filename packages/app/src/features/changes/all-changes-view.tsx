import { useMemo, useState } from 'react';

import type { StatusEntry } from '@midnite/git-shared';

import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react';

import { ChangeTotals } from '../../components/change-tree';
import { IconButton } from '../../components/icon-button';
import { useRepoStatus, useStatusCounts } from '../../services/use-status';
import { FileAccordion } from './file-accordion';
import {
  EXPAND_ALL_LIMIT,
  expandAll,
  NOTHING_EXPANDED,
  toggleExpanded,
  withheldByCap,
  type ExpansionState,
} from './expansion';

/**
 * Every changed file in one checkout, each in its own accordion — VS Code's
 * multi-diff editor.
 *
 * The Changes panel answers "what do I stage next", one file at a time. This
 * answers a different question — "what did I actually do here" — and it does
 * it for a checkout addressed BY NAME, so it can show a worktree the sidebar
 * has not selected. That is why every path through here carries an explicit
 * `worktreePath` rather than reading the store.
 *
 * No new IPC underneath: `status.get` and `status.fileDiff` have both taken an
 * optional `worktreePath` since Phase 6, and main validates it against
 * `git worktree list` before it becomes a cwd.
 */
export function AllChangesView({
  repoId,
  worktreePath,
  label,
}: {
  repoId: string;
  worktreePath: string;
  /** The branch or path this checkout is known by, for the empty state. */
  label: string;
}) {
  const { data: status, isPlaceholderData } = useRepoStatus({ repoId, worktreePath });
  const counts = useStatusCounts({ repoId, worktreePath });
  const [expanded, setExpanded] = useState<ExpansionState>(NOTHING_EXPANDED);

  const loaded = isPlaceholderData ? undefined : status;

  /*
    One row per PATH, not per porcelain-v2 record.

    The Changes panel deliberately lists a staged-then-edited file twice,
    because staging acts on one side at a time and hiding either would force a
    lie about which. Reading a whole checkout is the opposite case: the same
    filename appearing twice in a forty-item accordion list reads as a
    rendering bug, and there is nothing here to stage.
  */
  const entries = useMemo(
    () =>
      (loaded?.entries ?? [])
        .filter((entry, index, all) => all.findIndex((e) => e.path === entry.path) === index)
        .sort((a, b) => a.path.localeCompare(b.path)),
    [loaded],
  );

  const paths = useMemo(() => entries.map((entry) => entry.path), [entries]);
  const withheld = withheldByCap(paths);

  /*
    The counts each row shows, resolved on the SAME side its diff comes from —
    see `FileAccordionBody`, which reads the index for a file that is staged and
    otherwise untouched. Reading the worktree side for such a file would print
    `+0 −0` above a diff full of green.
  */
  const countsFor = (entry: StatusEntry) =>
    entry.unstaged === 'unmodified' ? counts.staged(entry.path) : counts.unstaged(entry.path);

  const totals = entries.reduce(
    (sum, entry) => {
      const row = countsFor(entry);
      return {
        fileCount: sum.fileCount + 1,
        insertions: sum.insertions + row.insertions,
        deletions: sum.deletions + row.deletions,
      };
    },
    { fileCount: 0, insertions: 0, deletions: 0 },
  );

  if (!loaded) {
    return <Empty>Reading {label}…</Empty>;
  }

  if (entries.length === 0) {
    return <Empty>No uncommitted changes in {label}.</Empty>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="min-w-0 truncate text-xs font-medium">{label}</span>
        {/*
          The whole tab in one line. Every file below is collapsed by default,
          so without this the answer to "how big is this branch's work" needs
          forty subprocesses and a scroll.
        */}
        <ChangeTotals {...totals} className="mr-auto" />

        <IconButton
          icon={ChevronsUpDown}
          label={withheld > 0 ? `Expand the first ${EXPAND_ALL_LIMIT} files` : 'Expand all files'}
          size="sm"
          onClick={() => setExpanded(expandAll(paths))}
        />
        <IconButton
          icon={ChevronsDownUp}
          label="Collapse all files"
          size="sm"
          onClick={() => setExpanded(NOTHING_EXPANDED)}
        />
      </header>

      {/*
        Said out loud, not swallowed. Opening four hundred diffs at once is not
        something this view will do, and a user who clicks Expand all and gets
        forty needs to know the other three hundred are still there.
      */}
      {withheld > 0 && expanded.size >= EXPAND_ALL_LIMIT ? (
        <p className="shrink-0 border-b border-border bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground">
          Showing the first {EXPAND_ALL_LIMIT} diffs — {withheld} more{' '}
          {withheld === 1 ? 'file is' : 'files are'} listed below and open individually.
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {entries.map((entry) => (
          <FileAccordion
            key={entry.path}
            repoId={repoId}
            worktreePath={worktreePath}
            entry={entry}
            counts={countsFor(entry)}
            open={expanded.has(entry.path)}
            onToggle={() => setExpanded((current) => toggleExpanded(current, entry.path))}
          />
        ))}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
