import { useMemo } from 'react';

import { useMapEngine } from './map-engine';
import { riggedModels } from './rigged-models';
import { useModelLibrary } from './use-model-library';

/**
 * What the Sprites feature asks of the Model tab (Phase 113 Theme S), packaged so each app that composes
 * both features fills Sprites' host port with one spread: `{ ...modelSpriteSeams }` gives a Sprites tab its
 * rigged models ("Render from 3D"), the engine a map's layout is written by, and the three.js render job
 * (loaded on the first request, so the renderer costs nothing until then). Sprites declares the matching
 * members optional on its `SpriteHost`; neither feature imports the other, and an app that composes only
 * Sprites leaves them out and gets Sprites' plain version.
 *
 * Reads the library through the media kit, so it works inside a media shell (the Sprites tab is one).
 */
function useRiggedModels(repoId: string | null) {
  const library = useModelLibrary(repoId);
  const models = useMemo(() => riggedModels(library.data ?? []), [library.data]);
  return { models, loading: library.isPending && repoId !== null };
}

export const modelSpriteSeams = {
  useRiggedModels,
  useMapEngine,
  loadRenderJob: () => import('./render-job'),
} as const;
