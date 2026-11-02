import type { AnimationImportResult, GitOpResult, SketchfabLicence, SketchfabSearchResult, SketchfabStatusResult } from '@midnite/studio-shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { bridge, noBridge, reportFailure, useToastStore } from '@midnite/studio-frame';

import { ANIMATION_KEYS } from './use-animations';

/**
 * Media ▸ Animations ▸ Sketchfab hooks (Phase 125 Theme E). The search and the download run in main with the
 * user's own token; the renderer is only ever told whether a token is set, and can write one (never read it).
 */
export const SKETCHFAB_KEYS = {
  status: [...ANIMATION_KEYS.all, 'sketchfab-status'] as const,
  search: (q: string, licences: readonly SketchfabLicence[]) => [...ANIMATION_KEYS.all, 'sketchfab-search', q, [...licences].sort()] as const,
};

export function useSketchfabStatus() {
  return useQuery<SketchfabStatusResult>({
    queryKey: SKETCHFAB_KEYS.status,
    queryFn: async () => {
      const result = await bridge()?.media.animation.sketchfabStatus();
      return result?.ok ? result.value : { hasToken: false };
    },
    staleTime: 0,
  });
}

/** Whether this window can store a token (Studio can; Midnite Gamer keeps keys in Vault only). */
export const canSetSketchfabToken = (): boolean => Boolean(bridge()?.secrets);

/** Stores (or, with `''`, clears) the token in main's vault. The value never comes back. */
export function useSetSketchfabToken() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (value: string) => {
      await bridge()?.secrets.set({ key: 'media.sketchfabApiToken', value });
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: SKETCHFAB_KEYS.status }),
  });
}

/** A search for the submitted text; `fetchNextPage` follows main's packed cursor. Idle until something is submitted. */
export function useSketchfabSearch(submitted: { q: string; licences: readonly SketchfabLicence[] } | null) {
  return useInfiniteQuery({
    queryKey: SKETCHFAB_KEYS.search(submitted?.q ?? '', submitted?.licences ?? []),
    enabled: submitted !== null && submitted.licences.length > 0,
    initialPageParam: undefined as string | undefined,
    retry: false,
    queryFn: async ({ pageParam }): Promise<SketchfabSearchResult> => {
      const result = await bridge()?.media.animation.sketchfabSearch({
        q: submitted?.q ?? '',
        licences: [...(submitted?.licences ?? [])],
        ...(pageParam ? { cursor: pageParam } : {}),
      });
      if (!result) throw new Error('Sketchfab search is not available here.');
      if (!result.ok) throw new Error('message' in result ? result.message : 'Sketchfab search failed');
      return result.value;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Downloads one model at a time per uid; `busy` holds the uids in flight so a row shows its own state. */
export function useSketchfabDownload() {
  const client = useQueryClient();
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const mark = (uid: string, on: boolean) =>
    setBusy((current) => {
      const next = new Set(current);
      if (on) next.add(uid);
      else next.delete(uid);
      return next;
    });
  const download = useMutation({
    mutationFn: async (uid: string): Promise<GitOpResult<AnimationImportResult>> => (await bridge()?.media.animation.sketchfabDownload({ uid })) ?? noBridge<AnimationImportResult>(),
    onMutate: (uid) => mark(uid, true),
    onSettled: (_result, _error, uid) => mark(uid, false),
    onSuccess: (result) => {
      reportFailure(result);
      if (result.ok && result.value.added.length > 0) useToastStore.getState().addToast({ message: 'Added to your animation library.', status: 'success' });
      if (result.ok && result.value.failed.length > 0) useToastStore.getState().addToast({ message: result.value.failed[0]!.reason, status: 'error' });
      void client.invalidateQueries({ queryKey: ANIMATION_KEYS.clips });
    },
  });
  const cancel = (uid: string) => void bridge()?.media.animation.sketchfabCancel({ uid });
  return { download: (uid: string) => download.mutate(uid), cancel, busy };
}
