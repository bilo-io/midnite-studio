import { useQuery, useQueryClient, useMutation, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { StartupResult, StartupSnapshot } from '@midnite/studio-shared';

/** The bridge's `startup` namespace; absent in a plain browser run, where the views show "unavailable". */
export const startupBridge = () => window.midniteStudio?.startup;

/** The one react-query key root: `['startup', op, args]`. A write's `startupChanged` invalidates all of it. */
export const STARTUP_KEY = ['startup'] as const;

export class StartupError extends Error {
  constructor(
    readonly kind: string,
    message: string,
  ) {
    super(message);
  }
}

/** Unwraps a `StartupResult` so react-query sees a refusal as an error carrying main's own message. */
export function unwrap<T>(result: StartupResult<T>): T {
  if (!result.ok) throw new StartupError(result.kind, result.message);
  return result.value;
}

/** Keeps the cache honest: any write, from any window, refetches. */
export function useStartupChanged(client: QueryClient): void {
  useEffect(() => startupBridge()?.onChanged(() => void client.invalidateQueries({ queryKey: STARTUP_KEY })), [client]);
}

/** The whole workspace snapshot, `['startup', 'get']`. */
export function useStartupSnapshot() {
  const client = useQueryClient();
  useStartupChanged(client);
  return useQuery<StartupSnapshot>({
    queryKey: [...STARTUP_KEY, 'get'],
    queryFn: async () => {
      const bridge = startupBridge();
      if (bridge === undefined) throw new StartupError('io', 'Midnite Startup is not available here.');
      return unwrap(await bridge.get());
    },
  });
}

/** A write: runs the op, then refetches the snapshot. The error is main's message, ready to show. */
export function useStartupWrite<A>(run: (bridge: NonNullable<ReturnType<typeof startupBridge>>, args: A) => Promise<StartupResult<unknown>>) {
  const client = useQueryClient();
  return useMutation<unknown, StartupError, A>({
    mutationFn: async (args) => {
      const bridge = startupBridge();
      if (bridge === undefined) throw new StartupError('io', 'Midnite Startup is not available here.');
      return unwrap(await run(bridge, args));
    },
    onSuccess: () => client.invalidateQueries({ queryKey: STARTUP_KEY }),
  });
}
