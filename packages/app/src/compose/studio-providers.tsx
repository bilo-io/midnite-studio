import type { ReactNode } from 'react';

import { ChatsHostProvider } from '@midnite/studio-feature-chats/renderer';
import { CouncilsHostProvider } from '@midnite/studio-feature-councils/renderer';
import { FinanceHostProvider } from '@midnite/studio-feature-finance/renderer';
import { MediaHostProvider } from '@midnite/studio-feature-media-core/renderer';
import { ModelsHostProvider } from '@midnite/studio-feature-models/renderer';
import { NotesHostProvider } from '@midnite/studio-feature-notes/renderer';
import { OptimizerHostProvider } from '@midnite/studio-feature-optimizer/renderer';
import { SlidesHostProvider } from '@midnite/studio-feature-slides/renderer';
import { FrameChromeProvider } from '@midnite/studio-frame';

import { STUDIO_CHATS_HOST } from './chats-host';
import { STUDIO_COUNCILS_HOST } from './councils-host';
import { STUDIO_FINANCE_HOST } from './finance-host';
import { STUDIO_MEDIA_HOST } from './media-host';
import { STUDIO_MODELS_HOST } from './models-host';
import { STUDIO_NOTES_HOST } from './notes-host';
import { STUDIO_OPTIMIZER_HOST } from './optimizer-host';
import { STUDIO_SLIDES_HOST } from './slides-host';
import { STUDIO_CHROME } from './studio-chrome';

/**
 * Everything Studio installs for the frame and the feature packages it
 * composes — Phase 113 Theme C's composition root.
 *
 * Rendered once per window (`App`, `DetachedRoot`) and by the unit-test
 * wrapper (`test-support/render.tsx`), so a feature renders the same way in
 * the main window, in a popout and under test. Each feature port a feature
 * package declares gets its Studio adapter installed here; a feature rendered
 * without its port throws rather than running unwired.
 *
 * Inside `DialogHost` on purpose: the chrome port's `useDialogs` is the
 * host's own hook.
 */
export function StudioProviders({ children }: { children: ReactNode }) {
  return (
    <FrameChromeProvider chrome={STUDIO_CHROME}>
      <OptimizerHostProvider host={STUDIO_OPTIMIZER_HOST}>
        <NotesHostProvider host={STUDIO_NOTES_HOST}>
          <FinanceHostProvider host={STUDIO_FINANCE_HOST}>
            <MediaHostProvider host={STUDIO_MEDIA_HOST}>
              <ModelsHostProvider host={STUDIO_MODELS_HOST}>
                <CouncilsHostProvider host={STUDIO_COUNCILS_HOST}>
                  <ChatsHostProvider host={STUDIO_CHATS_HOST}>
                    <SlidesHostProvider host={STUDIO_SLIDES_HOST}>{children}</SlidesHostProvider>
                  </ChatsHostProvider>
                </CouncilsHostProvider>
              </ModelsHostProvider>
            </MediaHostProvider>
          </FinanceHostProvider>
        </NotesHostProvider>
      </OptimizerHostProvider>
    </FrameChromeProvider>
  );
}
