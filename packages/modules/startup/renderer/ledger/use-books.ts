import { useQuery } from '@tanstack/react-query';

import type { LedgerBookSummary } from '@midnite/studio-shared';

/** The ledger bridge the Accountant module's host provides; absent where no book is mounted (a plain browser run). */
export const ledgerBridge = () => window.midniteStudio?.ledger;

/** Every book the shared books folder holds, for the link picker and for naming the linked one. `['startup', 'books']` so a Startup write refreshes it too. */
export function useBooks() {
  return useQuery<LedgerBookSummary[]>({
    queryKey: ['startup', 'books'],
    queryFn: async () => {
      const bridge = ledgerBridge();
      if (bridge === undefined) return [];
      const result = await bridge.listBooks();
      if (!result.ok) throw new Error(result.message);
      return result.value.books;
    },
  });
}
