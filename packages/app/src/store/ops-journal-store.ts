import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { appendJournalEntry, type OpJournalEntry } from '@midnite/studio-shared';

/**
 * The renderer's half of Phase 22 Theme H's ops journal — `shared/src/domain/journal.ts`
 * owns the schema and the pure `appendJournalEntry` cap/eviction logic; this
 * is the thin, persisted zustand wrapper around it, one array per repository.
 *
 * Persisted across restarts, like `dashboard-store.ts`'s per-repo boards: the
 * journal answers "what has this app done to this repo", and a journal that
 * empties on quit can only ever answer "...this session", which is a
 * materially smaller and less useful question (see the phase doc's Theme H
 * open question on exactly this).
 *
 * Entries for a closed repo are kept, same reasoning as the dashboard's
 * boards — re-adding a repository later should not look like its history
 * with this app never happened. `appendJournalEntry`'s cap
 * (`JOURNAL_ENTRY_CAP`, a few hundred) is what keeps this from growing
 * without bound rather than a prune-on-close policy.
 */
export interface OpsJournalState {
  entriesByRepo: Record<string, OpJournalEntry[]>;
  /** Append one entry for its own `repoId`, evicting the oldest past the cap. */
  record: (entry: OpJournalEntry) => void;
}

export const useOpsJournalStore = create<OpsJournalState>()(
  persist(
    (set) => ({
      entriesByRepo: {},
      record: (entry) =>
        set((state) => ({
          entriesByRepo: {
            ...state.entriesByRepo,
            [entry.repoId]: appendJournalEntry(state.entriesByRepo[entry.repoId] ?? [], entry),
          },
        })),
    }),
    {
      name: 'midnite-studio.ops-journal',
      version: 1,
      partialize: (state) => ({ entriesByRepo: state.entriesByRepo }),
    },
  ),
);

const EMPTY_ENTRIES: OpJournalEntry[] = [];

/**
 * One repository's entries, newest first. A selector hook rather than reading
 * `entriesByRepo` directly so a consumer only re-renders when ITS repo's list
 * changes, not on every write anywhere in the app.
 */
export function useJournalEntries(repoId: string | null): OpJournalEntry[] {
  return useOpsJournalStore((state) => (repoId ? (state.entriesByRepo[repoId] ?? EMPTY_ENTRIES) : EMPTY_ENTRIES));
}
