import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { bridge, noBridge, reportFailure } from '@midnite/studio-frame';
import type { AgentProfile, GitOpResult } from '@midnite/studio-shared';

export const AGENT_PROFILES_KEY = ['agent-profiles'] as const;

const failureMessage = (result: { ok: boolean; message?: string }): string =>
  result.message ?? 'The agents could not be read.';

/** The one query for the saved profiles, shared with any host that lists them outside this feature. */
export function agentProfilesQueryOptions() {
  return {
    queryKey: AGENT_PROFILES_KEY,
    queryFn: async (): Promise<AgentProfile[]> => {
      const result = await bridge()?.agentProfile.list();
      if (!result) throw new Error('The app bridge is unavailable.');
      if (!result.ok) throw new Error(failureMessage(result as { ok: boolean; message?: string }));
      return result.value.profiles;
    },
  };
}

/** Every saved profile. An envelope failure becomes `error`, not an exception thrown across the boundary. */
export function useAgentProfiles(): {
  profiles: AgentProfile[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const query = useQuery(agentProfilesQueryOptions());
  return {
    profiles: query.data ?? [],
    loading: query.isPending,
    error: query.error ? query.error.message : null,
    refetch: () => void query.refetch(),
  };
}

export type SaveOutcome = { status: 'saved'; profile: AgentProfile } | { status: 'conflict'; current: AgentProfile } | { status: 'failed' };

/** Saves a profile; `expectedUpdatedAt: null` is a new one. A conflict is returned, never reported. */
export function useSaveAgentProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { profile: AgentProfile; expectedUpdatedAt: number | null }): Promise<SaveOutcome> => {
      const b = bridge();
      const result = b ? await b.agentProfile.save(input) : noBridge<Exclude<SaveOutcome, { status: 'failed' }>>();
      if (!result.ok) {
        reportFailure(result);
        return { status: 'failed' };
      }
      return result.value;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: AGENT_PROFILES_KEY }),
  });
}

/** Deletes a profile; resolves to whether it went. */
export function useDeleteAgentProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<boolean> => {
      const b = bridge();
      const result: GitOpResult = b ? await b.agentProfile.delete({ id }) : noBridge();
      reportFailure(result);
      return result.ok;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: AGENT_PROFILES_KEY }),
  });
}

/** Opens the import dialog; resolves to the imported profile, or `null` on dismissal or failure. */
export function useImportAgentProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<AgentProfile | null> => {
      const b = bridge();
      const result = b ? await b.agentProfile.import() : noBridge<{ profile: AgentProfile | null }>();
      reportFailure(result);
      return result.ok ? result.value.profile : null;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: AGENT_PROFILES_KEY }),
  });
}

/** Opens the export dialog; resolves to the written path, or `null` on dismissal or failure. */
export function useExportAgentProfile() {
  return useMutation({
    mutationFn: async (id: string): Promise<string | null> => {
      const b = bridge();
      const result = b ? await b.agentProfile.export({ id }) : noBridge<{ path: string | null }>();
      reportFailure(result);
      return result.ok ? result.value.path : null;
    },
  });
}
