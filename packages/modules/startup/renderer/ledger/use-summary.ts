import { useQuery } from '@tanstack/react-query';

import type { StartupLedgerSummary } from '@midnite/studio-shared';

import { startupBridge } from '../data/use-startup';

/**
 * The linked book's cash today and actual burn, `['startup', 'ledgerSummary']` (refetched by every `startupChanged`).
 * `null` when no book is linked or the book cannot answer, so a view shows its own figures instead of an error.
 */
export function useLedgerSummary(linked: boolean) {
  return useQuery<StartupLedgerSummary | null>({
    queryKey: ['startup', 'ledgerSummary', linked],
    enabled: linked,
    queryFn: async () => {
      const result = await startupBridge()?.ledgerSummary();
      return result?.ok ? result.value : null;
    },
  });
}
