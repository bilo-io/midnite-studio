import { isCouncilRunLive, type CouncilRun } from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bridge, noBridge, reportFailure } from '@midnite/studio-frame';


const RUN_KEYS = {
  forCouncil: (councilId: string) => ['councils', councilId, 'runs'] as const,
  run: (runId: string) => ['council-runs', runId] as const,
};

/** How often a live run is re-fetched — matches upstream's own 1200ms cadence. */
const RUN_POLL_MS = 1200;

/**
 * A council's threads. Polls while any of them is live (Phase 133 Theme A):
 * before, only the open run polled, so the rail said Running until something
 * else happened to refetch the list.
 */
export function useCouncilRuns(councilId: string | null) {
  return useQuery({
    queryKey: RUN_KEYS.forCouncil(councilId ?? ''),
    queryFn: async () => (await bridge()?.council.run.list({ councilId: councilId ?? '' }))?.runs ?? [],
    enabled: councilId !== null,
    refetchInterval: (query) => ((query.state.data ?? []).some((run) => isCouncilRunLive(run.status)) ? RUN_POLL_MS : false),
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
      return status !== undefined && isCouncilRunLive(status) ? RUN_POLL_MS : false;
    },
  });
}

/** After a run changes: the run itself and its council's thread list. */
function invalidateRun(client: ReturnType<typeof useQueryClient>, run: Pick<CouncilRun, 'id' | 'councilId'>): void {
  void client.invalidateQueries({ queryKey: RUN_KEYS.run(run.id) });
  void client.invalidateQueries({ queryKey: RUN_KEYS.forCouncil(run.councilId) });
}

/** A follow-up turn on a settled thread (Phase 133 Theme D). */
export function useContinueCouncilRun() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { runId: string; prompt: string }) =>
      (await bridge()?.council.run.continue(input)) ?? noBridge<CouncilRun>(),
    onSuccess: (result) => {
      reportFailure<CouncilRun>(result);
      if (result.ok) {
        client.setQueryData(RUN_KEYS.run(result.value.id), result.value);
        invalidateRun(client, result.value);
      }
    },
  });
}

/** Stop a live turn (Phase 133 Theme A). */
export function useCancelCouncilRun() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { runId: string; councilId: string }) =>
      (await bridge()?.council.run.cancel({ runId: input.runId })) ?? noBridge<void>(),
    onSuccess: (result, variables) => {
      reportFailure<void>(result);
      invalidateRun(client, { id: variables.runId, councilId: variables.councilId });
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
      if (result.ok) {
        client.setQueryData(RUN_KEYS.run(result.value.id), result.value);
        void client.invalidateQueries({ queryKey: RUN_KEYS.forCouncil(variables.councilId) });
      }
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
