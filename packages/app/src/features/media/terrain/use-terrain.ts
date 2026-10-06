import type { ImageProviderId, TerrainBuildResult, TerrainGetResult, TerrainInputSlot, TerrainProgressEvent, TerrainRoadKeyResult } from '@midnite/studio-shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { bridge } from '../../../services/bridge';
import { noBridge, reportFailure } from '../../../services/bridge-result';
import { MEDIA_KEYS } from '../use-media';

/**
 * Media ▸ Terrain's data: one terrain's spec (plus whether it has been built) and the operations on
 * it. Keys sit under `MEDIA_KEYS.tab(repoId, 'terrain')`, so the same `mediaChanged` ping that
 * refreshes every Media tab refreshes this one, and `mediaTerrainChanged` refreshes it sooner.
 */
export type TerrainRef = { project: string; terrain: string };

export const terrainKey = (repoId: string, ref: TerrainRef) => [...MEDIA_KEYS.tab(repoId, 'terrain'), 'spec', ref.project, ref.terrain] as const;

export function useTerrain(repoId: string, ref: TerrainRef | null) {
  return useQuery<TerrainGetResult>({
    queryKey: terrainKey(repoId, ref ?? { project: '', terrain: '' }),
    enabled: ref !== null,
    retry: false,
    queryFn: async () => {
      const api = bridge()?.media.terrain;
      if (!api || !ref) throw new Error('Terrain is unavailable without the desktop bridge.');
      const result = await api.get({ repoId, ...ref });
      if (!result.ok) throw new Error(result.kind === 'error' ? result.message : 'Could not read the terrain.');
      return result.value;
    },
  });
}

/** Refreshes the tab when main announces a terrain changed (a build landed, an agent edited the spec). */
export function useTerrainChangedInvalidation(repoId: string): void {
  const client = useQueryClient();
  useEffect(() => {
    const off = bridge()?.media.terrain.onChanged((event) => {
      if (event.repoId === repoId) void client.invalidateQueries({ queryKey: MEDIA_KEYS.tab(repoId, 'terrain') });
    });
    return () => off?.();
  }, [client, repoId]);
}

/** The running build's latest stage, by build id. */
export function useTerrainProgress(buildId: string | null): TerrainProgressEvent | null {
  const [event, setEvent] = useState<TerrainProgressEvent | null>(null);
  useEffect(() => {
    setEvent(null);
    if (!buildId) return;
    const off = bridge()?.media.terrain.onProgress((next) => {
      if (next.buildId === buildId) setEvent(next);
    });
    return () => off?.();
  }, [buildId]);
  return event;
}

/** What the panel shows after a Generate: a built terrain's stats, a request for a height source, or nothing. */
export type BuildOutcome = { kind: 'built' } | { kind: 'needs-height-source' } | { kind: 'failed'; message: string } | { kind: 'cancelled' };

export function useTerrainActions(repoId: string, ref: TerrainRef) {
  const client = useQueryClient();
  const [buildId, setBuildId] = useState<string | null>(null);
  const invalidate = useCallback(() => client.invalidateQueries({ queryKey: MEDIA_KEYS.tab(repoId, 'terrain') }), [client, repoId]);

  const setSpec = useCallback(
    async (patch: Record<string, unknown>) => {
      const api = bridge()?.media.terrain;
      const result = api ? await api.setSpec({ repoId, ...ref, patch }) : noBridge<never>();
      reportFailure(result);
      await invalidate();
      return result;
    },
    [invalidate, repoId, ref],
  );

  const attach = useCallback(
    async (slot: TerrainInputSlot, file: File) => {
      const api = bridge()?.media.terrain;
      if (!api) return noBridge<never>();
      const result = await api.setInput({ repoId, ...ref, slot, bytes: await file.arrayBuffer(), name: file.name });
      reportFailure(result);
      await invalidate();
      return result;
    },
    [invalidate, repoId, ref],
  );

  /** Generates the heightmap picture from a prompt in main (through the Images service), then attaches it. */
  const attachFromPrompt = useCallback(
    async (req: { prompt: string; provider: ImageProviderId; model: string }) => {
      const api = bridge()?.media.terrain;
      if (!api) return noBridge<never>();
      const result = await api.setInput({ repoId, ...ref, slot: 'heightmap', ...req });
      if (!result.ok) reportFailure(result);
      await invalidate();
      return result;
    },
    [invalidate, repoId, ref],
  );

  const remove = useCallback(
    async (slot: TerrainInputSlot) => {
      const api = bridge()?.media.terrain;
      const result = api ? await api.setInput({ repoId, ...ref, slot, remove: true }) : noBridge<never>();
      reportFailure(result);
      await invalidate();
      return result;
    },
    [invalidate, repoId, ref],
  );

  const generate = useCallback(async (): Promise<BuildOutcome> => {
    const api = bridge()?.media.terrain;
    if (!api) return { kind: 'failed', message: 'The app bridge is unavailable.' };
    const id = crypto.randomUUID();
    setBuildId(id);
    try {
      const result = await api.build({ repoId, ...ref, buildId: id });
      if (!result.ok) {
        if (result.kind === 'error' && result.message === 'Build cancelled.') return { kind: 'cancelled' };
        reportFailure(result);
        return { kind: 'failed', message: result.kind === 'error' ? result.message : 'Conflict' };
      }
      await invalidate();
      return (result.value as TerrainBuildResult).status === 'built' ? { kind: 'built' } : { kind: 'needs-height-source' };
    } finally {
      setBuildId(null);
    }
  }, [invalidate, repoId, ref]);

  const cancel = useCallback(async () => {
    if (buildId) await bridge()?.media.terrain.cancel({ buildId });
  }, [buildId]);

  const paint = useCallback(
    async (req: { cls: number; radiusPx: number; points: [number, number][] }) => {
      const api = bridge()?.media.terrain;
      if (!api) return noBridge<never>();
      const result = await api.paint({ repoId, ...ref, ...req });
      reportFailure(result);
      await invalidate();
      return result;
    },
    [invalidate, repoId, ref],
  );

  /** Theme H: a live roads-mask preview (or, with `pick`, the eyedropper). Failures stay quiet — it is a preview. */
  const roadKey = useCallback(
    async (req: { colour?: string; tolerance?: number; pick?: [number, number] }): Promise<TerrainRoadKeyResult | null> => {
      const api = bridge()?.media.terrain;
      if (!api) return null;
      const result = await api.roadKey({ repoId, ...ref, ...req });
      return result.ok ? result.value : null;
    },
    [repoId, ref],
  );

  return { buildId, building: buildId !== null, setSpec, attach, attachFromPrompt, remove, generate, cancel, paint, roadKey };
}
