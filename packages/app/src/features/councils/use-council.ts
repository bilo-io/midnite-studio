import {
  failure,
  type Council,
  type CouncilMember,
  type CouncilMemberProvider,
  type GitOpResult,
} from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { bridge } from '../../services/bridge';
import { useToastStore } from '../../store/toast-store';

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

/**
 * No preload under vitest/jsdom — the fallback every write mutation below
 * returns. Generic (rather than one shared constant) so each call site's
 * `GitOpResult<T>` keeps its own `value` shape instead of collapsing into a
 * union across every T this file uses.
 */
function noBridge<T>(): GitOpResult<T> {
  return failure('The app bridge is unavailable.');
}

function reportFailure<T>(result: GitOpResult<T>): void {
  if (!result.ok && result.kind === 'error') {
    useToastStore.getState().addToast({ message: result.message, status: 'error' });
  }
}

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
    mutationFn: async (input: { name: string; description?: string }) =>
      (await bridge()?.council.create(input)) ?? noBridge<Council>(),
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
