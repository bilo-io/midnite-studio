import type { ReactNode } from 'react';

import { LuUndo2 } from 'react-icons/lu';

import { entryUndoReason, type OpJournalEntry } from '@midnite/studio-shared';

import { useUndoJournalEntry, WIRED_UNDO_OPS } from '../../services/use-journal';
import { useJournalEntries } from '../../store/ops-journal-store';

/**
 * "What this app did" — the ops journal's own list, Phase 22 Theme H.
 *
 * Deliberately a different list from `ReflogList` beside it: the reflog is
 * every write the REPOSITORY has seen, from any tool; this is every write
 * THIS APP made, which is the one thing the reflog cannot say for itself.
 *
 * Only the two ops in `WIRED_UNDO_OPS` (`stash-drop`, `branch-delete`) get a
 * live Undo button — everything else `entry.undoable` marks true is still
 * shown as such (a domain fact this pass does not hide), it simply has no
 * button yet; everything un-undoable shows its one-line reason instead of a
 * disabled control with nothing said.
 */
export function JournalList({ repoId }: { repoId: string | null }) {
  const entries = useJournalEntries(repoId);
  const undo = useUndoJournalEntry();

  if (repoId === null) {
    return (
      <Centered>Select a repository to see what this app has done to it.</Centered>
    );
  }

  if (entries.length === 0) {
    return (
      <Centered>
        Nothing recorded yet — every write this app makes to this repository will show up here.
      </Centered>
    );
  }

  return (
    <ul className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="Ops journal">
      {entries.map((entry) => (
        <JournalRow key={entry.id} entry={entry} onUndo={() => void undo(entry)} />
      ))}
    </ul>
  );
}

function JournalRow({ entry, onUndo }: { entry: OpJournalEntry; onUndo: () => void }) {
  const wired = WIRED_UNDO_OPS.includes(entry.op) && entry.undoable;
  const reason = entryUndoReason(entry);

  return (
    <li className="flex items-start gap-2 border-b border-border/50 py-2 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{entry.label}</p>
        <p className="text-xs text-muted-foreground">{formatWhen(entry.at)}</p>
        {reason ? <p className="mt-0.5 text-xs text-muted-foreground">{reason}</p> : null}
      </div>
      {wired ? (
        <button
          type="button"
          onClick={onUndo}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-accent"
        >
          <LuUndo2 aria-hidden className="h-3.5 w-3.5" />
          Undo
        </button>
      ) : null}
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

function formatWhen(at: number): string {
  return new Date(at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}
