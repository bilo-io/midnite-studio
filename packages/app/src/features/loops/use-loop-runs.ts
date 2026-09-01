import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { bridge } from '../../services/bridge';
import { useToastStore } from '../../store/toast-store';

const LOOP_RUNS_KEY = ['loop-runs'] as const;

/**
 * The FAB's run ledger, as the renderer sees it (Phase 35).
 *
 * Event-driven rather than polled: main emits `loopRunsChanged` on every
 * start, stop and pty-exit finalisation, and the list is capped at 200 rows,
 * so invalidating and re-fetching the whole thing costs less than inventing a
 * per-row patch protocol. A run's END is main's to record — nothing here
 * writes an `endedAt`.
 */
export function useLoopRuns() {
  const client = useQueryClient();

  useEffect(() => {
    const api = bridge();
    if (!api) return;
    return api.loopRuns.onChanged(() => {
      void client.invalidateQueries({ queryKey: LOOP_RUNS_KEY });
    });
  }, [client]);

  return useQuery({
    queryKey: LOOP_RUNS_KEY,
    queryFn: async () => (await bridge()?.loopRuns.list())?.runs ?? [],
    // Under vitest/jsdom and the e2e mock bridge there is no event channel;
    // an empty list is the honest answer rather than a hang.
    initialData: [],
  });
}

/**
 * Announce a Start. Failure is reported and swallowed: the loop itself is
 * already running by the time this is called, and a ledger that could not
 * write its row is not a reason to pretend the pty isn't there.
 */
export async function recordLoopStart(req: {
  loopId: string;
  sessionId: string;
  composedPrompt: string;
  checkedModifierIds: string[];
}): Promise<void> {
  const result = await bridge()?.loopRuns.start(req);
  if (result && !result.ok && result.kind === 'error') {
    useToastStore.getState().addToast({
      message: `Loop history not recorded: ${result.message}`,
      status: 'warning',
    });
  }
}

/**
 * Finalise the session's running record as `stopped` — called BEFORE the pty
 * is killed, so the ledger says "the user stopped this" rather than the
 * `exited` the kill would otherwise land as.
 */
export async function recordLoopStop(sessionId: string): Promise<void> {
  await bridge()?.loopRuns.stop({ sessionId });
}
