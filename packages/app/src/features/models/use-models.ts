import type { OllamaModel, OllamaSearchResultItem, OllamaSettings } from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { bridge } from '../../services/bridge';
import { noBridge, reportFailure } from '../../services/bridge-result';
import { useModelsPullQueueStore } from './models-pull-queue-store';

/**
 * The Models view's data layer (Phase 96 Theme C) — React Query over
 * `bridge().ollama.*`, mirroring `use-video.ts`'s own shape: global query
 * keys (an Ollama daemon is not scoped to an open checkout, same reasoning as
 * Video Studio), `noBridge`/`reportFailure` for the write mutations.
 *
 * `app.tsx`'s `QueryClient` sets `staleTime: Infinity` globally (no network,
 * freshness comes from explicit invalidation) — the two list queries here
 * override that with `staleTime: 0` because Ollama's own state changes
 * outside this app entirely (`ollama pull` in a terminal, another tool
 * unloading a model), so "refetch whenever asked" is the correct default for
 * this one domain, not the exception `refetchOnWindowFocus: false` exists to
 * prevent for git status.
 */
const MODELS_KEYS = {
  status: ['ollama-status'] as const,
  models: ['ollama-models'] as const,
  running: ['ollama-running'] as const,
  detail: (model: string) => ['ollama-model-detail', model] as const,
  settings: ['ollama-settings'] as const,
  search: (scope: string, query: string) => ['ollama-search', scope, query] as const,
  cloudList: ['ollama-cloud-list'] as const,
  signInStatus: ['ollama-sign-in-status'] as const,
  apiKeyHas: ['ollama-api-key-has'] as const,
};

export function useOllamaStatus() {
  return useQuery({
    queryKey: MODELS_KEYS.status,
    queryFn: async () =>
      (await bridge()?.ollama.status()) ?? { reachable: false, version: null, host: '' },
    staleTime: 0,
  });
}

export function useOllamaModels() {
  return useQuery({
    queryKey: MODELS_KEYS.models,
    queryFn: async () => {
      const result = await bridge()?.ollama.list();
      return result?.ok ? result.value.models : [];
    },
    staleTime: 0,
  });
}

export function useOllamaRunning() {
  return useQuery({
    queryKey: MODELS_KEYS.running,
    queryFn: async () => {
      const result = await bridge()?.ollama.ps();
      return result?.ok ? result.value.models : [];
    },
    staleTime: 0,
  });
}

/** Lazily fetched — only once a row's capability chips are actually asked for
 *  (`enabled`), never for the whole Installed list up front. */
export function useOllamaShow(model: string | null) {
  return useQuery({
    queryKey: MODELS_KEYS.detail(model ?? ''),
    queryFn: async () => {
      const result = await bridge()?.ollama.show({ model: model ?? '' });
      return result?.ok ? result.value : null;
    },
    enabled: model !== null,
    staleTime: 0,
  });
}

/** Invalidates every list this domain's writes can affect — the shared tail
 *  every mutation hook below runs `onSuccess`. */
function useInvalidateModels() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: MODELS_KEYS.models });
    void client.invalidateQueries({ queryKey: MODELS_KEYS.running });
  };
}

export function useUnloadModel() {
  const invalidate = useInvalidateModels();
  return useMutation({
    mutationFn: async (model: string) => (await bridge()?.ollama.unload({ model })) ?? noBridge<void>(),
    onSuccess: (result) => {
      reportFailure<void>(result);
      if (result.ok) invalidate();
    },
  });
}

export function useDeleteModel() {
  const invalidate = useInvalidateModels();
  return useMutation({
    mutationFn: async (model: string) => (await bridge()?.ollama.delete({ model })) ?? noBridge<void>(),
    onSuccess: (result) => {
      reportFailure<void>(result);
      if (result.ok) invalidate();
    },
  });
}

export function usePullModel() {
  return useMutation({
    mutationFn: async (model: string) =>
      (await bridge()?.ollama.pull({ model })) ?? noBridge<{ pullId: string; model: string }>(),
    onSuccess: (result) => reportFailure(result),
  });
}

export function usePullCancel() {
  return useMutation({
    mutationFn: async (pullId: string) => (await bridge()?.ollama.pullCancel({ pullId })) ?? noBridge<void>(),
  });
}

/**
 * Theme G's one-click `<model>-64k` context variant — `POST /api/create`
 * (Theme B), already wired end to end (`bridge().ollama.create`, the
 * `mstudio:ollama:create` channel, `ollamaCreate` in main). `ollama/
 * client.ts`'s own doc comment on that function says per-line progress was
 * deliberately left out of Theme B's PR ("Theme G's own progress UI … awaits
 * completion rather than exposing per-line progress the way `ollamaPull`
 * does"), so this stays a plain mutation — the modal shows a spinner while
 * it is pending, not a `pull`-style progress bar.
 */
export function useCreateModel() {
  const invalidate = useInvalidateModels();
  return useMutation({
    mutationFn: async (req: { from: string; name: string; parameters?: Record<string, string | number> }) =>
      (await bridge()?.ollama.create(req)) ?? noBridge<{ name: string }>(),
    onSuccess: (result) => {
      reportFailure(result);
      if (result.ok) invalidate();
    },
  });
}

export function useOllamaSettings() {
  return useQuery({
    queryKey: MODELS_KEYS.settings,
    queryFn: async () => (await bridge()?.ollama.settings.get()) ?? { host: null, defaultModel: null },
  });
}

export function useSetOllamaSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<OllamaSettings>) =>
      (await bridge()?.ollama.settings.set(patch)) ?? noBridge<OllamaSettings>(),
    onSuccess: (result) => {
      reportFailure(result);
      if (result.ok) client.setQueryData(MODELS_KEYS.settings, result.value);
    },
  });
}

/**
 * The one subscription that feeds `models-pull-queue-store.ts` from the wire
 * — every progress event updates the store, and a terminal (`done: true`)
 * event also invalidates the Installed/running lists so a finished pull
 * shows up there without a manual refetch. Mounted once from `ModelsView`;
 * the store itself is module-level zustand state, so the pull queue panel's
 * rows survive navigating away and back even though this subscription does
 * not receive events while unmounted — see `models-pull-queue-store.ts`'s
 * own doc comment.
 */
export function useRefetchModelsOnPullDone(): void {
  const invalidate = useInvalidateModels();
  const progress = useModelsPullQueueStore((s) => s.progress);
  useEffect(() => {
    const api = bridge();
    if (!api) return undefined;
    return api.ollama.onPullProgress((event) => {
      progress(event);
      if (event.done) invalidate();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `invalidate` is a fresh closure every render by design (see `useInvalidateModels`); depending on it would resubscribe every render for no benefit.
  }, [progress]);
}

/** Re-runs the Installed/running queries whenever the app window regains
 *  focus — Ollama's own state can change outside this app entirely (a
 *  terminal `ollama pull`, another tool unloading a model). */
export function useRefetchModelsOnFocus(): void {
  const invalidate = useInvalidateModels();
  useEffect(() => {
    const onFocus = () => invalidate();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// --- search + cloud (Phase 96 Themes D, F) -----------------------------------

export type OllamaSearchQueryResult = {
  items: OllamaSearchResultItem[];
  stale: boolean;
  updatedAt: string | null;
  /**
   * `true` only for `{kind:'error', code:'parse'}` — a non-empty ollama.com
   * page this app's scraper failed to read. The Discover tab needs this
   * distinguished from an ordinary network failure (silently swallowed to
   * `[]`, like every other list query here) so it can fall back to
   * pull-by-name with a link out, per the phase doc.
   */
  parseFailed: boolean;
};

/** Debounced by the caller (`models-view.tsx`), exactly like `useFinanceSearch`. */
export function useOllamaSearch(query: string, scope: 'local' | 'cloud') {
  const trimmed = query.trim();
  return useQuery({
    queryKey: MODELS_KEYS.search(scope, trimmed),
    queryFn: async (): Promise<OllamaSearchQueryResult> => {
      const result = await bridge()?.ollama.search({ query: trimmed, scope });
      if (!result) return { items: [], stale: false, updatedAt: null, parseFailed: false };
      if (result.ok) {
        return {
          items: result.value.items,
          stale: result.value.stale,
          updatedAt: result.value.updatedAt,
          parseFailed: false,
        };
      }
      return {
        items: [],
        stale: false,
        updatedAt: null,
        parseFailed: result.kind === 'error' && result.code === 'parse',
      };
    },
    enabled: trimmed.length > 0,
    // The server (`library-search.ts`) already caches per query for ~1h; a
    // shorter client-side staleTime just avoids re-hitting main on every
    // debounce tick for the SAME query while the tab stays open.
    staleTime: 60_000,
  });
}

/** The cloud catalogue (Theme F) — only fetched once the tab is actually open. */
export function useOllamaCloudList(enabled: boolean) {
  return useQuery({
    queryKey: MODELS_KEYS.cloudList,
    queryFn: async (): Promise<OllamaModel[]> => {
      const result = await bridge()?.ollama.cloudList();
      return result?.ok ? result.value.models : [];
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useOllamaSignInStatus() {
  return useQuery({
    queryKey: MODELS_KEYS.signInStatus,
    queryFn: async () => (await bridge()?.ollama.signInStatus()) ?? { signedIn: false },
    staleTime: 30_000,
  });
}

/** Whether `ollama.apiKey` is set in the vault — never the value itself. */
export function useOllamaApiKeyHasKey() {
  return useQuery({
    queryKey: MODELS_KEYS.apiKeyHas,
    queryFn: async () => (await bridge()?.secrets.has({ key: 'ollama.apiKey' })) ?? { hasKey: false },
    staleTime: 0,
  });
}

/** An empty string clears the key (`secrets-handlers.ts`'s own convention). */
export function useSetOllamaApiKey() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (value: string) => {
      await bridge()?.secrets.set({ key: 'ollama.apiKey', value });
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: MODELS_KEYS.apiKeyHas });
    },
  });
}
