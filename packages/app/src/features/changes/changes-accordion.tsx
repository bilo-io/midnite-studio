import { useMemo, useState } from 'react';

import type { ChangeCounts, StatusEntry } from '@midnite/studio-shared';

import { LuChevronsDownUp, LuChevronsUpDown } from 'react-icons/lu';

import { ChangeTotals } from '../../components/change-tree';
import { IconButton } from '../../components/icon-button';
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
 * The summary bar plus one accordion per changed file.
 *
 * Shared by the sidebar's all-changes tab (`AllChangesView`, which addresses a
 * checkout by name and fetches its own data) and the Changes panel's inline
 * "view all" toggle (which already has the active checkout's entries and
 * counts, and passes them straight through). The two differ only in where
 * their data comes from and what — if anything — sits to the left of the
 * totals; the accordion list itself is one implementation.
 */
export function ChangesAccordion({
  repoId,
  worktreePath,
  entries: rawEntries,
  counts,
  totals,
  leading,
  emptyMessage = 'No uncommitted changes.',
}: {
  repoId: string;
  /** Omitted addresses the globally selected worktree — see `FileAccordion`. */
  worktreePath?: string;
  entries: readonly StatusEntry[];
  counts: {
    staged: (path: string) => ChangeCounts;
    unstaged: (path: string) => ChangeCounts;
  };
  totals: { fileCount: number; insertions: number; deletions: number };
  /** Rendered before the totals — the tab's checkout label, or nothing. */
  leading?: React.ReactNode;
  emptyMessage?: string;
}) {
  const [expanded, setExpanded] = useState<ExpansionState>(NOTHING_EXPANDED);

  /*
    One row per PATH, not per porcelain-v2 record.

    The Changes panel deliberately lists a staged-then-edited file twice,
    because staging acts on one side at a time and hiding either would force a
    lie about which. Reading a whole checkout is the opposite case: the same
    filename appearing twice in a forty-item accordion list reads as a
    rendering bug, and there is nothing here to stage.
  */
  const entries = useMemo(() => {
    const seenPaths = new Set<string>();
    return rawEntries
      .filter((entry) => {
        if (seenPaths.has(entry.path)) return false;
        seenPaths.add(entry.path);
        return true;
      })
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [rawEntries]);

  const paths = useMemo(() => entries.map((entry) => entry.path), [entries]);
  const withheld = withheldByCap(paths);

  /*
    The counts each row shows, resolved on the SAME side its diff comes from —
    see `FileAccordion`'s body, which reads the index for a file that is
    staged and otherwise untouched. Reading the worktree side for such a file
    would print `+0 −0` above a diff full of green.
  */
  const countsFor = (entry: StatusEntry) =>
    entry.unstaged === 'unmodified' ? counts.staged(entry.path) : counts.unstaged(entry.path);

  if (entries.length === 0) {
    return <Empty>{emptyMessage}</Empty>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        {leading}
        {/*
          The whole set in one line. Every file below is collapsed by default,
          so without this the answer to "how big is this" needs forty
          subprocesses and a scroll.
        */}
        <ChangeTotals {...totals} />

        <IconButton
          icon={LuChevronsUpDown}
          label={withheld > 0 ? `Expand the first ${EXPAND_ALL_LIMIT} files` : 'Expand all files'}
          size="sm"
          onClick={() => setExpanded(expandAll(paths))}
        />
        <IconButton
          icon={LuChevronsDownUp}
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
