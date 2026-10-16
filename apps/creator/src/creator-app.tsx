import { MediaHostProvider } from '@midnite/studio-feature-media-core/renderer';
import { AudioHostProvider } from '@midnite/studio-feature-media-audio/renderer';
import { DocsHostProvider } from '@midnite/studio-feature-media-docs/renderer';
import { SlidesHostProvider } from '@midnite/studio-feature-slides/renderer';
import { VideoHostProvider } from '@midnite/studio-feature-media-video/renderer';
import { ImagesHostProvider } from '@midnite/studio-feature-media-images/renderer';
import { FrameChromeProvider } from '@midnite/studio-frame';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';

import { CREATOR_CHROME, CreatorDialogHost } from './compose/creator-chrome';
import { CREATOR_AUDIO_HOST, CREATOR_DOCS_HOST, CREATOR_IMAGES_HOST, CREATOR_SLIDES_HOST, CREATOR_VIDEO_HOST, CREATOR_MEDIA_HOST } from './compose/creator-host';
import { CreatorHome } from './views/creator-home';

/**
 * Midnite Creator — media-core's shell with the Docs, Images, Video and Audio tab features, composed over the
 * frame as its own app: the frame chrome, a query client for the media store's cache, and the
 * three host ports Creator implements (`compose/creator-host.tsx`), nested.
 */
/** The deck loads when a doc is first presented, not with the shell. */
const SlidesModal = lazy(() => import('@midnite/studio-feature-slides/renderer/modal').then((m) => ({ default: m.SlidesModal })));

export function CreatorApp() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={CREATOR_CHROME}>
        <MediaHostProvider host={CREATOR_MEDIA_HOST}>
          <DocsHostProvider host={CREATOR_DOCS_HOST}>
            <ImagesHostProvider host={CREATOR_IMAGES_HOST}>
              <AudioHostProvider host={CREATOR_AUDIO_HOST}>
                <VideoHostProvider host={CREATOR_VIDEO_HOST}>
                  <SlidesHostProvider host={CREATOR_SLIDES_HOST}>
                    <CreatorHome />
                    <Suspense fallback={null}>
                      <SlidesModal />
                    </Suspense>
                  </SlidesHostProvider>
                </VideoHostProvider>
              </AudioHostProvider>
            </ImagesHostProvider>
          </DocsHostProvider>
        </MediaHostProvider>
        <CreatorDialogHost />
      </FrameChromeProvider>
    </QueryClientProvider>
  );
}
