import type {
  Council,
  CouncilAvailableProvider,
  CouncilGenerated,
  CouncilMember,
  CouncilMemberProvider,
  CouncilRecommendation,
  CouncilSynthesisType,
} from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bridge, noBridge, reportFailure } from '@midnite/studio-frame';


/**
 * Councils are global — not scoped to a repo/worktree — so these keys carry
 * no `repoId`, unlike almost everything else in `services/queries.ts`. Kept
 * in this feature's own module rather than added there: nothing about a
 * council invalidates on a watcher event, a ref change, or any of the other
 * reasons that file's keys are structured the way they are.
 */
const COUNCIL_KEYS = {
  list: ['councils'] as const,
  detail: (id: string) => ['councils', id] as const,
};

export function useCouncils() {
  return useQuery({
    queryKey: COUNCIL_KEYS.list,
    queryFn: async () => (await bridge()?.council.list())?.councils ?? [],
  });
}

export function useCouncil(id: string | null) {
  return useQuery<Council | null>({
    queryKey: COUNCIL_KEYS.detail(id ?? ''),
    queryFn: async () => (await bridge()?.council.get({ id: id ?? '' }))?.council ?? null,
    enabled: id !== null,
  });
}

export function useCreateCouncil() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string;
      members?: CouncilMember[];
      synthProvider?: CouncilMemberProvider;
      synthModel?: string;
      synthesisType?: CouncilSynthesisType;
      synthInstructions?: string;
    }) => (await bridge()?.council.create(input)) ?? noBridge<Council>(),
    onSuccess: (result) => {
      reportFailure<Council>(result);
      if (result.ok) void client.invalidateQueries({ queryKey: COUNCIL_KEYS.list });
    },
  });
}

export function useUpdateCouncilMembers() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      members: CouncilMember[];
      synthProvider: CouncilMemberProvider;
      synthModel?: string;
      synthesisType?: CouncilSynthesisType;
      synthInstructions?: string;
    }) => (await bridge()?.council.updateMembers(input)) ?? noBridge<Council>(),
    onSuccess: (result, variables) => {
      reportFailure<Council>(result);
      if (result.ok) {
        void client.invalidateQueries({ queryKey: COUNCIL_KEYS.detail(variables.id) });
        void client.invalidateQueries({ queryKey: COUNCIL_KEYS.list });
      }
    },
  });
}

export function useRemoveCouncil() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await bridge()?.council.remove({ id })) ?? noBridge<void>(),
    onSuccess: (result) => {
      reportFailure<void>(result);
      if (result.ok) void client.invalidateQueries({ queryKey: COUNCIL_KEYS.list });
    },
  });
}

/**
 * "Recommend a council" (Phase 133 Theme E): main asks a small, fast model.
 * A failure is a normal answer the dialog shows, not a toast.
 */
export function useRecommendCouncil() {
  return useMutation({
    mutationFn: async (input: {
      name: string;
      brief?: string;
      providers?: CouncilMemberProvider[];
      maxMembers?: number;
      models?: CouncilAvailableProvider[];
    }) => (await bridge()?.council.recommend(input)) ?? noBridge<CouncilRecommendation>(),
  });
}

/**
 * "Generate with AI" for a Custom council (Phase 134 Theme E): instructions
 * and members from the fastest installed CLI, held in main to what is
 * available. A failure is an answer the synthesizer card shows.
 */
export function useGenerateCouncil() {
  return useMutation({
    mutationFn: async (input: { name: string; topic?: string; count: number; providers: CouncilAvailableProvider[] }) =>
      (await bridge()?.council.generate(input)) ?? noBridge<CouncilGenerated>(),
  });
}
