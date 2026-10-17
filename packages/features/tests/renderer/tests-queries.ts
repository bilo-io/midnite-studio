import { bridge } from '@midnite/studio-frame';
import type { TestDiscovery, TestTrustStatus } from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/*
  The Tests view's data layer (Phase 113 Theme O): discovery, per-suite trust
  and run/cancel, moved verbatim out of the app's `services/queries.ts`, which
  re-exports them (the repos sidebar's tests section and the status-bar verdict
  read them too). Everything here reaches main through the frame's bridge.
*/

/**
 * The test query keys — moved verbatim from the app's `keys` (Phase 113 Theme O), which spreads
 * them back in, so every key tuple is exactly what it was.
 */
export const testsKeys = {
  testsDiscover: (repoId: string) => ['repos', repoId, 'tests', 'discover'] as const,
  testsTrust: (repoId: string, suiteId: string) =>
    ['repos', repoId, 'tests', 'trust', suiteId] as const,
};


// --- repository tests (Phase 19) ---------------------------------------------

export const EMPTY_DISCOVERY = (repoId: string): TestDiscovery => ({ repoId, packages: [], generatedAt: 0 });
export const NO_TEST_TRUST: TestTrustStatus = { state: 'untrusted', trustedAt: null };

/** Suites this checkout declares. Safe unprompted — discovery runs nothing. */
export function useTestDiscovery(repoId: string | null) {
  return useQuery<TestDiscovery>({
    queryKey: testsKeys.testsDiscover(repoId ?? ''),
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId) return EMPTY_DISCOVERY(repoId ?? '');
      return api.tests.discover({ repoId });
    },
    enabled: repoId !== null,
    // Matches the discovery cache's own TTL — asking more often than that
    // buys nothing, since main answers from the same cached pass.
    staleTime: 60_000,
  });
}

export function useRefreshTestDiscovery(repoId: string | null) {
  const client = useQueryClient();
  return () => {
    if (!repoId) return;
    void client.invalidateQueries({ queryKey: testsKeys.testsDiscover(repoId) });
  };
}

/** Whether one suite is trusted to run, and whether the grant still applies. */
export function useTestTrustStatus(repoId: string | null, suiteId: string | null) {
  return useQuery<TestTrustStatus>({
    queryKey: testsKeys.testsTrust(repoId ?? '', suiteId ?? ''),
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId || !suiteId) return NO_TEST_TRUST;
      return api.tests.trustStatus({ repoId, suiteId });
    },
    enabled: repoId !== null && suiteId !== null,
    staleTime: Infinity,
  });
}

/** Approve one suite. The caller must have shown the user its literal command. */
export function useTrustTestSuite(repoId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ suiteId, fingerprint }: { suiteId: string; fingerprint: string }) => {
      const api = bridge();
      if (!api || !repoId) return NO_TEST_TRUST;
      return api.tests.trust({ repoId, suiteId, fingerprint });
    },
    onSuccess: (status, { suiteId }) => {
      if (repoId) client.setQueryData(testsKeys.testsTrust(repoId, suiteId), status);
    },
  });
}

export function useUntrustTestSuite(repoId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (suiteId: string) => {
      const api = bridge();
      if (!api || !repoId) return NO_TEST_TRUST;
      return api.tests.untrust({ repoId, suiteId });
    },
    onSuccess: (status, suiteId) => {
      if (repoId) client.setQueryData(testsKeys.testsTrust(repoId, suiteId), status);
    },
  });
}

/**
 * Start a trusted suite. Resolves with a run id immediately — the run itself
 * plays out on `tests.onOutput`/`tests.onResult`, which `tests-store.ts`
 * subscribes to once, in the Tests view.
 */
export function useRunTestSuite(repoId: string | null) {
  return useMutation({
    mutationFn: async (suiteId: string) => {
      const api = bridge();
      if (!api || !repoId) return { ok: false as const, reason: 'no bridge' };
      return api.tests.run({ repoId, suiteId });
    },
  });
}

export function useCancelTestRun() {
  return (runId: string) => bridge()?.tests.cancel({ runId });
}
