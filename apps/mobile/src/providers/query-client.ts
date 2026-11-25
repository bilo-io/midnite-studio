import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { SourceError } from '../data/queries';
import { useNetworkStatus } from '../data/network-status';

export interface QueryClientOptions {
  /** Called when any query or mutation fails with `kind: 'auth'` (Phase 146 E6). */
  onAuthError?: () => void;
}

export function createQueryClient(options: QueryClientOptions = {}): QueryClient {
  const handle = (error: unknown) => {
    const status = useNetworkStatus.getState();
    if (error instanceof SourceError && error.kind === 'network') status.recordNetworkFailure();
    else status.recordReached();
    if (error instanceof SourceError && error.kind === 'auth') options.onAuthError?.();
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError: handle, onSuccess: () => useNetworkStatus.getState().recordReached() }),
    mutationCache: new MutationCache({ onError: handle }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // A rejected token or missing scope will not heal on retry.
        retry: (count, error) => !(error instanceof SourceError && (error.kind === 'auth' || error.kind === 'scope')) && count < 1,
      },
    },
  });
}
