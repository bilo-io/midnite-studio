import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { createStandaloneForgeHost, type ForgeHost } from '@midnite/studio-feature-forge/renderer';
import type { TestsHost } from '@midnite/studio-feature-tests/renderer';
import { bridge } from '@midnite/studio-frame';
import { pickForgeRemote, type ForgeKind } from '@midnite/studio-shared';

import { coderStore, useCoderStore } from '../coder-store';

/**
 * Coder's side of the forge and tests host ports (Phase 113 Theme O).
 *
 * The forge host is the feature's own standalone host — plain chrome and a plain diff — given what
 * only Coder knows: the selected repository (from its own list), each repository's forge kind (main
 * reads it from `.git/config` and answers `remotes.list`), how to open a URL, and the review-actions
 * switch. None of Studio's optional members: no Present, no agent hand-off, no embedded browser, no
 * "Fetch to compare" (no git) and no suggestion apply (no file writes).
 */

const useActiveRepo = (): { repoId: string | null } => ({ repoId: useCoderStore((s) => s.selectedRepoId) });

/** The query key Studio reads remotes under (`keys.remotes`), so the cache shape is the same. */
const remotesKey = (repoId: string) => ['repos', repoId, 'remotes'] as const;

function useForgeKind(repoId: string | null): ForgeKind | null {
  const remotes = useQuery({
    queryKey: remotesKey(repoId ?? ''),
    queryFn: async () => (repoId ? ((await bridge()?.remotes.list({ repoId })) ?? []) : []),
    enabled: repoId !== null,
    staleTime: 60_000,
  });
  return pickForgeRemote(remotes.data ?? [])?.forge?.kind ?? null;
}

/** Main's window-open handler sends https links to the system browser; nothing loads into Coder. */
const openExternal = (url: string): void => {
  window.open(url, '_blank', 'noopener');
};

export const CODER_FORGE_HOST: ForgeHost = createStandaloneForgeHost({
  useActiveRepo,
  useForgeKind,
  openExternal,
  useForgeWritesEnabled: () => useCoderStore((s) => s.writesEnabled),
  onOpenReview: (repoId) => {
    coderStore.getState().selectRepo(repoId);
    coderStore.getState().setView('reviews');
  },
  storageKey: 'midnite-coder.forge',
});

const TESTS_WIDTH = { initial: 320, min: 240, max: 640 };
const TESTS_WIDTH_KEY = 'midnite-coder.testsListWidth';

function useTestsListWidth() {
  const [size, setState] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem(TESTS_WIDTH_KEY));
      return Number.isFinite(stored) && stored > 0 ? stored : TESTS_WIDTH.initial;
    } catch {
      return TESTS_WIDTH.initial;
    }
  });
  const setSize = useCallback((value: number) => {
    setState(value);
    try {
      window.localStorage.setItem(TESTS_WIDTH_KEY, String(value));
    } catch {
      // Private window or blocked storage: the width lasts for this session.
    }
  }, []);
  return { size, setSize, ...TESTS_WIDTH };
}

/** No `runInTerminal`: Coder has no terminal yet, so the Tests view leaves that button out. */
export const CODER_TESTS_HOST: TestsHost = {
  useActiveRepo,
  useListWidth: useTestsListWidth,
};
