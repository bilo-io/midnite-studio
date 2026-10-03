import {
  MODEL_DEFAULT_TEXT_MODEL,
  type ModelGenerateInput,
  type ModelGenerateProgressEvent,
  type ModelGenerateResult,
  type ModelGenerateStage,
  type ModelProviders,
  type ModelSpec,
  type LoopModel,
} from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { bridge } from '../../../services/bridge';
import { noBridge, reportFailure } from '../../../services/bridge-result';
import { MEDIA_KEYS } from '../use-media';

/**
 * Media ▸ Models data hooks. Generation runs in main; this file asks which
 * engines can run, starts/cancels a run and tracks its stage so the viewer can
 * say what is happening while a local model works (it takes a while).
 */
export const MODEL_KEYS = { providers: ['media-model-providers'] as const };

/**
 * The engine the panel remembers: `'ollama'` or a headless agent's id. Its own
 * tiny persisted store, like Images' prefs, so Media tabs landing in parallel
 * never race on the `ui-store` migrations.
 */
type ModelPrefs = {
  engineId: string;
  ollamaModel: string;
  agentModel: LoopModel;
  /** `''` = the best installed vision model. */
  visionModel: string;
  set: (patch: Partial<Omit<ModelPrefs, 'set'>>) => void;
};

export const useModelPrefs = create<ModelPrefs>()(
  persist(
    (set) => ({
      engineId: 'ollama',
      ollamaModel: MODEL_DEFAULT_TEXT_MODEL,
      agentModel: 'default',
      visionModel: '',
      set: (patch) => set(patch),
    }),
    { name: 'mstudio.media.model-prefs', storage: createJSONStorage(() => localStorage), version: 1 },
  ),
);

export function useModelProviders() {
  return useQuery<ModelProviders | undefined>({
    queryKey: MODEL_KEYS.providers,
    queryFn: async () => (await bridge()?.media.model.providers())?.providers,
    staleTime: 15_000,
  });
}

export type PendingModelGeneration = { generationId: string; project: string; stage: ModelGenerateStage };

export function useModelGeneration(repoId: string | null) {
  const client = useQueryClient();
  const [pending, setPending] = useState<Record<string, PendingModelGeneration>>({});
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    const off = bridge()?.media.model.onProgress((event: ModelGenerateProgressEvent) => {
      if (event.repoId !== repoId) return;
      setPending((current) => {
        if (event.status !== 'running') {
          const { [event.generationId]: _done, ...rest } = current;
          return rest;
        }
        return {
          ...current,
          [event.generationId]: {
            generationId: event.generationId,
            project: event.project,
            stage: event.stage ?? current[event.generationId]?.stage ?? 'generating',
          },
        };
      });
      if (event.status === 'succeeded') void client.invalidateQueries({ queryKey: MEDIA_KEYS.tab(event.repoId, 'model') });
    });
    return () => off?.();
  }, [client, repoId]);

  const generate = useMutation({
    mutationFn: async (input: Omit<ModelGenerateInput, 'generationId' | 'repoId'>) => {
      if (!repoId) return noBridge<ModelGenerateResult>();
      const generationId = `model-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setLastError(null);
      setPending((current) => ({
        ...current,
        [generationId]: { generationId, project: input.project, stage: input.image ? 'describing' : 'generating' },
      }));
      const result = (await bridge()?.media.model.generate({ ...input, generationId, repoId })) ?? noBridge<ModelGenerateResult>();
      setPending(({ [generationId]: _done, ...rest }) => rest);
      const cancelled = !result.ok && result.kind === 'error' && result.message === 'cancelled';
      if (!result.ok && !cancelled) {
        setLastError(result.kind === 'error' ? result.message : 'Generation failed.');
        reportFailure(result);
      }
      void client.invalidateQueries({ queryKey: MEDIA_KEYS.tab(repoId, 'model') });
      return result;
    },
  });

  const cancelAll = () => {
    for (const id of Object.keys(pending)) void bridge()?.media.model.cancel({ generationId: id });
  };

  return { generate, pending: Object.values(pending), cancelAll, lastError };
}

/** Save-as of one generated model in `.obj` or `.fbx`; a dismissed dialog is not an error. */
export function useModelExport(repoId: string | null, defaultDir: string | null) {
  return useMutation({
    mutationFn: async (input: { project: string; path: string; format: 'obj' | 'fbx'; spec?: ModelSpec }) => {
      if (!repoId) return noBridge<{ dest: string }>();
      const result =
        (await bridge()?.media.model.export({ repoId, ...input, ...(defaultDir ? { defaultDir } : {}) })) ??
        noBridge<{ dest: string }>();
      const dismissed = !result.ok && result.kind === 'error' && result.message === 'cancelled';
      if (!dismissed) reportFailure(result);
      return result;
    },
  });
}

/** Persist an edited design: rewrites the sidecar and the obj/mtl/fbx trio. */
export function useModelSaveEdit(repoId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { project: string; path: string; spec: ModelSpec }) => {
      if (!repoId) return noBridge<{ files: string[] }>();
      const result = (await bridge()?.media.model.saveEdit({ repoId, ...input })) ?? noBridge<{ files: string[] }>();
      reportFailure(result);
      if (result.ok) void client.invalidateQueries({ queryKey: MEDIA_KEYS.tab(repoId, 'model') });
      return result;
    },
  });
}
