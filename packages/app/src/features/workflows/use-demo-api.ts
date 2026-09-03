import type { DemoApiStatus } from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { bridge } from '../../services/bridge';
import { reportFailure } from '../../services/bridge-result';

/**
 * `noBridge`'s own `GitOpResult<T>` is a distributive conditional type, which
 * TypeScript spreads across a union `T` (`DemoApiStatus` is one) into
 * `GitOpResult<A> | GitOpResult<B>` — a different shape from zod's
 * NON-distributed `{ ok: true; value: A | B }` inference for
 * `DemoApiStartResponse`. Mixing the two in one `mutationFn` left
 * `useMutation` unable to infer a single `GitOpResult<T>` for `reportFailure`
 * to accept, so the no-bridge fallback is written out by hand instead —
 * still exactly one arm of the shared failure schema.
 */
const noBridgeResult = { ok: false as const, kind: 'error' as const, message: 'The app bridge is unavailable.' };

/**
 * The workflow demo API's status pill (Phase 43 Theme D's carried-over item).
 *
 * Polled rather than pushed: Theme D shipped the server and its three IPC
 * channels with no `demoApiChanged` event to go with them (unlike
 * `workflowRunChanged`), and a local dev server started and stopped by hand
 * from this same pill changes state rarely enough that a short poll is
 * plenty — there is no live traffic here to look frozen the way a running
 * workflow node would.
 */
const DEMO_API_KEY = ['demo-api', 'status'] as const;
const POLL_MS = 2000;

export function useDemoApiStatus() {
  return useQuery<DemoApiStatus>({
    queryKey: DEMO_API_KEY,
    queryFn: async () => (await bridge()?.demoApi.status()) ?? { running: false },
    refetchInterval: POLL_MS,
    initialData: { running: false },
  });
}

export function useStartDemoApi() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const api = bridge();
      if (!api) return noBridgeResult;
      return api.demoApi.start();
    },
    onSuccess: (result) => {
      reportFailure(result);
      void client.invalidateQueries({ queryKey: DEMO_API_KEY });
    },
  });
}

export function useStopDemoApi() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const api = bridge();
      if (!api) return noBridgeResult;
      return api.demoApi.stop();
    },
    onSuccess: (result) => {
      // `T` can't be inferred through `GitOpResult`'s conditional type when
      // every arm but the failures is the bare `{ ok: true }` a void op
      // returns — spelled out explicitly rather than left to infer `unknown`.
      reportFailure<void>(result);
      void client.invalidateQueries({ queryKey: DEMO_API_KEY });
    },
  });
}
