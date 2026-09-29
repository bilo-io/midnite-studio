import {
  DEFAULT_IMAGE_PROVIDER,
  imageModelsFor,
  type ImageGenerateProgressEvent,
  type ImageGenerateRequest,
  type ImageProviderId,
  type ImageProviderStatus,
  type SecretKey,
} from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { bridge } from '../../../services/bridge';
import { noBridge, reportFailure } from '../../../services/bridge-result';
import { MEDIA_KEYS } from '../use-media';

/**
 * Media ▸ Images data hooks (Phase 99 Theme C). Generation runs in main; this
 * file only asks for provider status, starts/cancels a run and tracks its
 * progress events so the gallery can show shimmer tiles until files land.
 */

export const IMAGE_KEYS = {
  providers: ['media-image-providers'] as const,
  secret: (key: SecretKey) => ['media-image-secret', key] as const,
};

/**
 * Default provider/model for the create panel — Settings ▸ Media ▸ Images.
 * Its own tiny persisted store rather than more `ui-store` fields: Themes B–E
 * land in parallel, and the ui-store's versioned migrations are the one file
 * all of them would otherwise race on.
 */
type ImagePrefs = {
  provider: ImageProviderId;
  model: string;
  setDefault: (provider: ImageProviderId, model: string) => void;
};

export const useImagePrefs = create<ImagePrefs>()(
  persist(
    (set) => ({
      provider: DEFAULT_IMAGE_PROVIDER,
      model: imageModelsFor(DEFAULT_IMAGE_PROVIDER)[0]?.id ?? '',
      setDefault: (provider, model) => set({ provider, model }),
    }),
    { name: 'mstudio.media.image-prefs', storage: createJSONStorage(() => localStorage), version: 1 },
  ),
);

export function useImageProviders() {
  return useQuery<ImageProviderStatus[]>({
    queryKey: IMAGE_KEYS.providers,
    queryFn: async () => (await bridge()?.media.image.providers())?.providers ?? [],
    staleTime: 30_000,
  });
}

export function useImageSecretHas(key: SecretKey) {
  return useQuery({
    queryKey: IMAGE_KEYS.secret(key),
    queryFn: async () => (await bridge()?.secrets.has({ key })) ?? { hasKey: false },
    staleTime: 0,
  });
}

/** Set (or, with `''`, clear) an image provider key; the value never comes back. */
export function useSetImageSecret(key: SecretKey) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (value: string) => {
      await bridge()?.secrets.set({ key, value });
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: IMAGE_KEYS.secret(key) });
      void client.invalidateQueries({ queryKey: IMAGE_KEYS.providers });
    },
  });
}

export type PendingGeneration = { generationId: string; project: string; total: number; completed: number };

/**
 * Start and track generations for one repo. `pending` holds every run still
 * going, so the gallery can draw `total - completed` shimmer tiles for it.
 */
export function useImageGeneration(repoId: string | null) {
  const client = useQueryClient();
  const [pending, setPending] = useState<Record<string, PendingGeneration>>({});
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    const off = bridge()?.media.image.onProgress((event: ImageGenerateProgressEvent) => {
      if (event.repoId !== repoId) return;
      setPending((current) => {
        if (!current[event.generationId] && event.status !== 'running') return current;
        if (event.status !== 'running') {
          const { [event.generationId]: _done, ...rest } = current;
          return rest;
        }
        return {
          ...current,
          [event.generationId]: {
            generationId: event.generationId,
            project: event.project,
            total: event.total,
            completed: event.completed,
          },
        };
      });
      if (event.completed > 0 || event.status !== 'running') {
        void client.invalidateQueries({ queryKey: MEDIA_KEYS.tab(event.repoId, 'image') });
      }
    });
    return () => off?.();
  }, [client, repoId]);

  const generate = useMutation({
    mutationFn: async (input: Omit<ImageGenerateRequest, 'generationId' | 'repoId'>) => {
      if (!repoId) return noBridge<{ files: string[] }>();
      const generationId = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setLastError(null);
      setPending((current) => ({
        ...current,
        [generationId]: { generationId, project: input.project, total: input.count, completed: 0 },
      }));
      const result =
        (await bridge()?.media.image.generate({ ...input, generationId, repoId })) ??
        noBridge<{ files: string[] }>();
      setPending(({ [generationId]: _done, ...rest }) => rest);
      const cancelled = !result.ok && result.kind === 'error' && result.message === 'cancelled';
      if (!result.ok && !cancelled) {
        setLastError(result.kind === 'error' ? result.message : 'Generation failed.');
        reportFailure(result);
      }
      void client.invalidateQueries({ queryKey: MEDIA_KEYS.tab(repoId, 'image') });
      return result;
    },
  });

  const cancelAll = () => {
    for (const id of Object.keys(pending)) void bridge()?.media.image.cancel({ generationId: id });
  };

  return { generate, pending: Object.values(pending), cancelAll, lastError };
}
