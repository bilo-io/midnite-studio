import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ReportRange = 'month' | 'last-month' | 'quarter' | 'fiscal-year' | 'last-fiscal-year' | 'custom';

export type LedgerUiState = {
  bookId: string | null;
  journalFilter: { accountId: string | null; query: string };
  reportRange: ReportRange;
  /** Not persisted: asks the Overview to open the book settings sheet. */
  settingsOpen: boolean;
  setBookId: (id: string | null) => void;
  setJournalFilter: (patch: Partial<LedgerUiState['journalFilter']>) => void;
  setReportRange: (range: ReportRange) => void;
  setSettingsOpen: (open: boolean) => void;
};

type Persisted = Pick<LedgerUiState, 'bookId' | 'journalFilter' | 'reportRange'>;

export const LEDGER_UI_DEFAULTS: Persisted = { bookId: null, journalFilter: { accountId: null, query: '' }, reportRange: 'fiscal-year' };

/** A v0 (or unknown) blob falls back to the defaults. */
export function migrateLedgerUi(raw: unknown, version: number): Persisted {
  return version < 1 || typeof raw !== 'object' || raw === null ? LEDGER_UI_DEFAULTS : (raw as Persisted);
}

/** The viewing choices only; books and entries live in main. */
export const useLedgerUiStore = create<LedgerUiState>()(
  persist(
    (set) => ({
      ...LEDGER_UI_DEFAULTS,
      settingsOpen: false,
      setBookId: (bookId) => set({ bookId }),
      setJournalFilter: (patch) => set((s) => ({ journalFilter: { ...s.journalFilter, ...patch } })),
      setReportRange: (reportRange) => set({ reportRange }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
    }),
    {
      name: 'midnite-studio.ledger-ui',
      version: 1,
      migrate: migrateLedgerUi,
      partialize: (s): Persisted => ({ bookId: s.bookId, journalFilter: s.journalFilter, reportRange: s.reportRange }),
    },
  ),
);

/** A persisted `bookId` that no longer exists falls back to the first book, or null with none. */
export function resolveBookId(bookId: string | null, books: readonly { id: string }[]): string | null {
  if (bookId !== null && books.some((b) => b.id === bookId)) return bookId;
  return books[0]?.id ?? null;
}
