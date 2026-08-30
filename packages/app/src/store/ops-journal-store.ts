import { create } from 'zustand';

export interface OpsJournalEntry {
  id: string;
  opName: string;
  ref: string;
  previousSha: string;
  newSha: string;
  timestamp: number;
}

export interface OpsJournalState {
  journal: OpsJournalEntry[];
  recordOp: (entry: Omit<OpsJournalEntry, 'id' | 'timestamp'>) => void;
  clearJournal: () => void;
}

export const useOpsJournalStore = create<OpsJournalState>((set) => ({
  journal: [],
  recordOp: (entry) =>
    set((state) => ({
      journal: [
        { ...entry, id: crypto.randomUUID(), timestamp: Date.now() },
        ...state.journal,
      ].slice(0, 50),
    })),
  clearJournal: () => set({ journal: [] }),
}));
