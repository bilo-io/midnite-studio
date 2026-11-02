import { parseModelSidecar, resolveRig, type AnimationClip } from '@midnite/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { bridge, useMediaKit } from '@midnite/studio-frame';

import { useModelLibrary } from '../use-model-library';
import { riggedModels, type RiggedModel } from '../rigged-models';
import type { DecodedClip } from './clip-decode';
import { rigSkeleton, type SkeletonSpec } from './skeleton-spec';

/**
 * Data for the timeline player (Phase 125 Theme D): a library clip's bytes decoded by three's loaders, and the
 * rigged models of the open repo's Models library as preview skeletons. The decode is cached by content hash, so
 * flipping between clips (or back to one) does not re-read the file.
 */
export function useDecodedClip(clip: Pick<AnimationClip, 'id' | 'sha256'>) {
  return useQuery<DecodedClip>({
    queryKey: ['media-animation-decoded', clip.id, clip.sha256],
    staleTime: Infinity,
    gcTime: 60_000,
    retry: false,
    queryFn: async () => {
      const animation = bridge()?.media.animation;
      if (!animation) throw new Error('Clips are unavailable without the desktop bridge.');
      const result = await animation.read({ id: clip.id });
      if (!result.ok) throw new Error('message' in result ? result.message : 'The clip file could not be read.');
      const { decodeClip } = await import('./clip-decode');
      return decodeClip(result.value);
    },
  });
}

/** The repo's rigged models, reported up through `onChange`. Only mounted when a repo is open (the Models library needs one). */
export function RigChoices({ repoId, onChange }: { repoId: string; onChange: (models: RiggedModel[]) => void }) {
  const library = useModelLibrary(repoId);
  const models = library.data;
  useEffect(() => onChange(models ? riggedModels(models) : []), [models, onChange]);
  return null;
}

/** The chosen model's rig as a preview skeleton; `null` until it loads or when it has none. */
export function useRigSkeleton(repoId: string | null, model: RiggedModel | null): { skeleton: SkeletonSpec | null; loading: boolean; error: string | null } {
  const query = useQuery<SkeletonSpec | null>({
    queryKey: ['media-animation-rig', repoId, model?.project, model?.path],
    enabled: repoId !== null && model !== null,
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      if (!repoId || !model) return null;
      const read = await bridge()?.media.file.read({ repoId, tab: 'model', project: model.project, path: model.path });
      if (!read?.ok) throw new Error('The model could not be read.');
      const spec = parseModelSidecar(read.value)?.spec;
      const rig = spec ? resolveRig(spec) : null;
      if (!rig) throw new Error('This model has no usable rig.');
      return rigSkeleton(rig);
    },
  });
  return { skeleton: query.data ?? null, loading: query.isFetching, error: query.error instanceof Error ? query.error.message : null };
}

/** The open repo's id when the host provides one (the global library works with no repo). */
export function useOptionalRepoId(): string | null {
  const kit = useMediaKit();
  // A kit without the hook (a test double) means "no repo"; the hook identity is stable, so this is not conditional per render.
  return kit.useMediaRepoId ? kit.useMediaRepoId() : null;
}

/** A fixed-rate clock while `active`: calls `onFrame` with the seconds since the previous frame. */
export function useFrameClock(active: boolean, onFrame: (dt: number) => void): void {
  const [cb] = useState(() => ({ current: onFrame }));
  cb.current = onFrame;
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      cb.current(dt);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, cb]);
}
