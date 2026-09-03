import type { CouncilRun } from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { bridge } from '../../services/bridge';
import { noBridge, reportFailure } from '../../services/bridge-result';

const RUN_KEYS = {
  forCouncil: (councilId: string) => ['councils', councilId, 'runs'] as const,
  run: (runId: string) => ['council-runs', runId] as const,
};

/** How often a live run is re-fetched — matches upstream's own 1200ms cadence. */
const RUN_POLL_MS = 1200;

export function useCouncilRuns(councilId: string | null) {
  return useQuery({
    queryKey: RUN_KEYS.forCouncil(councilId ?? ''),
    queryFn: async () => (await bridge()?.council.run.list({ councilId: councilId ?? '' }))?.runs ?? [],
    enabled: councilId !== null,
  });
}

/**
 * Polls while the run is live, stops the instant it reaches a terminal
 * status — the same "poll until settled" shape `use-council-run.ts` upstream
 * uses, just over `invoke` rather than a WebSocket.
 */
export function useCouncilRun(runId: string | null) {
  return useQuery<CouncilRun | null>({
    queryKey: RUN_KEYS.run(runId ?? ''),
    queryFn: async () => (await bridge()?.council.run.get({ runId: runId ?? '' }))?.run ?? null,
    enabled: runId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'running' || status === 'synthesizing' ? RUN_POLL_MS : false;
    },
  });
}

export function useStartCouncilRun() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { councilId: string; prompt: string }) =>
      (await bridge()?.council.run.start(input)) ?? noBridge<CouncilRun>(),
    onSuccess: (result, variables) => {
      reportFailure<CouncilRun>(result);
      if (result.ok) void client.invalidateQueries({ queryKey: RUN_KEYS.forCouncil(variables.councilId) });
    },
  });
}

export function useSkipCouncilMember() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { runId: string; memberId: string }) =>
      (await bridge()?.council.run.skipMember(input)) ?? noBridge<void>(),
    onSuccess: (result, variables) => {
      reportFailure<void>(result);
      if (result.ok) void client.invalidateQueries({ queryKey: RUN_KEYS.run(variables.runId) });
    },
  });
}

export function useRetryCouncilMember() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { runId: string; memberId: string }) =>
      (await bridge()?.council.run.retryMember(input)) ?? noBridge<void>(),
    onSuccess: (result, variables) => {
      reportFailure<void>(result);
      if (result.ok) void client.invalidateQueries({ queryKey: RUN_KEYS.run(variables.runId) });
    },
  });
}
