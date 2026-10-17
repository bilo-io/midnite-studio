import type { SpriteComposerProps, SpriteHost } from '@midnite/studio-feature-media-sprite/renderer';
import { useMemo } from 'react';

import { AiComposer, ProviderModelPicker } from '../components/ai-thread';
import { imagePickerProviders } from '../features/media/image/create-panel';
import { MEDIA_PROMPT_BOX } from '../features/media/prompt-input';
import { modelSpriteSeams } from '@midnite/studio-feature-media-model/renderer';

/**
 * Studio's side of the Sprite feature's host port (Phase 113 Theme S).
 *
 * The composer is the ai-thread box with its provider/model picker. "Render from 3D" reads the Models
 * library for rigged assets, a map's layout is written by the engine the Models tab is set to, and the
 * three.js render job builds the scene with the Model tab's own rig and geometry code: those three come
 * from the Model feature's `modelSpriteSeams`, one spread that Gamer uses too.
 *
 * Installed by Studio's Media view (`features/media/media-view.tsx`). The app root loads the same render job
 * through `loadSpriteRenderJob` (`./media-sprite/load-render-job`) for `useSpriteRenderHost`, because that
 * listener is mounted outside the Media view.
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

export const STUDIO_SPRITE_HOST = {
  Composer,
  ...modelSpriteSeams,
} satisfies SpriteHost;
