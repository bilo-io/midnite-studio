import type { SpriteComposerProps, SpriteHost } from '@midnite/studio-feature-media-sprite/renderer';
import { useMemo } from 'react';

import { AiComposer, ProviderModelPicker } from '../components/ai-thread';
import { imagePickerProviders } from '../features/media/image/create-panel';
import { MEDIA_PROMPT_BOX } from '../features/media/prompt-input';
import { useModelLibrary } from '../features/media/model/use-model-library';
import { loadSpriteRenderJob } from './media-sprite/load-render-job';
import { useMapEngine } from './media-sprite/map-engine';
import { riggedModels } from './media-sprite/sprite-rig';

/**
 * Studio's side of the Sprite feature's host port (Phase 113 Theme S).
 *
 * The composer is the ai-thread box with its provider/model picker; "Render from 3D" reads the Models
 * library for rigged assets; a map's layout is written by the engine the Models tab is set to; and the
 * three.js render job — which builds the scene with the Model tab's own rig and geometry code — is
 * Studio's (`compose/media-sprite/render-job.ts`), loaded lazily on the first render request.
 *
 * Installed by Studio's Media view (`features/media/media-view.tsx`). The same `loadSpriteRenderJob` is
 * what the app root passes to `useSpriteRenderHost`, because that listener is mounted outside the Media view.
 */

function Composer({ picker, ...props }: SpriteComposerProps) {
  const providers = useMemo(
    () =>
      picker
        ? imagePickerProviders(picker.statuses).map((p) => {
            const blocked = picker.blockedFor?.(p.id as Parameters<typeof picker.blockedFor>[0]);
            return blocked && !p.disabled ? { ...p, disabled: true, reason: blocked } : p;
          })
        : [],
    [picker],
  );
  return (
    <AiComposer
      {...props}
      enterToSend={false}
      boxClassName={MEDIA_PROMPT_BOX}
      leading={
        picker ? (
          <ProviderModelPicker
            testId={picker.testId}
            providers={providers}
            provider={picker.provider}
            models={[...picker.models]}
            model={picker.model}
            onProviderChange={(id) => picker.onProviderChange(id as typeof picker.provider)}
            onModelChange={picker.onModelChange}
          />
        ) : null
      }
    />
  );
}

function useRiggedModels(repoId: string | null) {
  const library = useModelLibrary(repoId);
  const models = useMemo(() => riggedModels(library.data ?? []), [library.data]);
  return { models, loading: library.isPending && repoId !== null };
}

export const STUDIO_SPRITE_HOST = {
  Composer,
  useRiggedModels,
  useMapEngine,
  loadRenderJob: loadSpriteRenderJob,
} satisfies SpriteHost;
