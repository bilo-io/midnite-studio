import type { SpriteGetResult, SpriteGroupId, SpritePatchOp, SpriteProgressEvent } from '@midnite/studio-shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { bridge, noBridge, reportFailure, useMediaKit } from '@midnite/studio-frame';

/**
 * Media ▸ Sprites' data: one asset's spec and frame metadata, plus the generation job. Keys sit
 * under the kit's `keys.tab(repoId, 'sprite')`, so the same `mediaChanged` ping that refreshes every
 * Media tab refreshes this one, and `mediaSpriteChanged` refreshes it sooner.
 */
export type SpriteRef = { group: SpriteGroupId; asset: string };

export function useSprite(repoId: string, ref: SpriteRef | null) {
  const { keys } = useMediaKit();
  const target = ref ?? { group: 'characters' as const, asset: '' };
  return useQuery<SpriteGetResult>({
    queryKey: [...keys.tab(repoId, 'sprite'), 'spec', target.group, target.asset],
    enabled: ref !== null,
    retry: false,
    queryFn: async () => {
      const api = bridge()?.media.sprite;
      if (!api || !ref) throw new Error('Sprites are unavailable without the desktop bridge.');
      const result = await api.get({ repoId, ...ref });
      if (!result.ok) throw new Error(result.kind === 'error' ? result.message : 'Could not read the sprite.');
      return result.value;
    },
  });
}

/** Refreshes the tab when main announces an asset changed (a job wrote frames, an agent edited the spec). */
export function useSpriteChangedInvalidation(repoId: string): void {
  const client = useQueryClient();
  const { keys } = useMediaKit();
  useEffect(() => {
    const off = bridge()?.media.sprite.onChanged((event) => {
      if (event.repoId === repoId) void client.invalidateQueries({ queryKey: keys.tab(repoId, 'sprite') });
    });
    return () => off?.();
  }, [client, repoId, keys]);
}

/** The latest progress event per job. Kept for every job, because a quick failure can beat the `generate` reply. */
export function useSpriteProgress(): Readonly<Record<string, SpriteProgressEvent>> {
  const [events, setEvents] = useState<Record<string, SpriteProgressEvent>>({});
  useEffect(() => {
    const off = bridge()?.media.sprite.onProgress((event) => setEvents((current) => ({ ...current, [event.jobId]: event })));
    return () => off?.();
  }, []);
  return events;
}

export function useSpriteActions(repoId: string) {
  const client = useQueryClient();
  const { keys } = useMediaKit();
  const invalidate = useCallback(() => client.invalidateQueries({ queryKey: keys.tab(repoId, 'sprite') }), [client, repoId, keys]);

  const create = useCallback(
    async (spec: Record<string, unknown>) => {
      const api = bridge()?.media.sprite;
      const result = api ? await api.library({ op: 'create', repoId, spec }) : noBridge<never>();
      reportFailure(result);
      await invalidate();
      return result;
    },
    [invalidate, repoId],
  );

  const setSpec = useCallback(
    async (ref: SpriteRef, patch: Record<string, unknown>) => {
      const api = bridge()?.media.sprite;
      const result = api ? await api.setSpec({ repoId, ...ref, patch }) : noBridge<never>();
      reportFailure(result);
      await invalidate();
      return result;
    },
    [invalidate, repoId],
  );

  /** Starts a job. Failures that are the user's to act on (busy, no model) come back in the result. */
  const generate = useCallback(async (ref: SpriteRef, opts: { turnaround?: true; clips?: string[]; method?: 'hand-drawn'; layout?: 'keep' } = {}) => {
    const api = bridge()?.media.sprite;
    return api ? api.generate({ repoId, ...ref, ...opts }) : noBridge<never>();
  }, [repoId]);

  /** Attach an image, approve the current one, or drop it (Theme D's reference card). Failures come back in the result. */
  const setReference = useCallback(
    async (
      ref: SpriteRef,
      change: { bytes: Uint8Array; name: string } | { approve: true; frames: 'keep' | 'mark' } | { remove: true } | { fromFrame: { clip: string; dir: string; n: number } },
    ) => {
      const api = bridge()?.media.sprite;
      const result = api ? await api.setReference({ repoId, ...ref, ...change }) : noBridge<never>();
      await invalidate();
      return result;
    },
    [invalidate, repoId],
  );

  const cancel = useCallback(async (jobId: string) => {
    const api = bridge()?.media.sprite;
    return api ? api.cancel({ jobId }) : noBridge<never>();
  }, []);

  /** Frame-strip edits (Theme G). Failures are toasted; a re-roll's job id comes back in the result. */
  const patchFrames = useCallback(
    async (ref: SpriteRef, ops: SpritePatchOp[]) => {
      const api = bridge()?.media.sprite;
      const result = api ? await api.patchFrames({ repoId, ...ref, ops }) : noBridge<never>();
      reportFailure(result);
      await invalidate();
      return result;
    },
    [invalidate, repoId],
  );

  /** Imports a Tiled `.tmj` as a new map (Theme J); main asks for the file. A cancelled dialog answers `{}`. */
  const importMap = useCallback(async () => {
    const api = bridge()?.media.sprite;
    const result = api ? await api.importMap({ repoId }) : noBridge<never>();
    reportFailure(result);
    await invalidate();
    return result;
  }, [invalidate, repoId]);

  return { create, setSpec, setReference, generate, cancel, patchFrames, importMap, invalidate };
}
