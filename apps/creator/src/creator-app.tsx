import { MediaHostProvider } from '@midnite/studio-feature-media-core/renderer';
import { DocsHostProvider } from '@midnite/studio-feature-media-docs/renderer';
import { ImagesHostProvider } from '@midnite/studio-feature-media-images/renderer';
import { FrameChromeProvider } from '@midnite/studio-frame';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { CREATOR_CHROME, CreatorDialogHost } from './compose/creator-chrome';
import { CREATOR_DOCS_HOST, CREATOR_IMAGES_HOST, CREATOR_MEDIA_HOST } from './compose/creator-host';
import { CreatorHome } from './views/creator-home';

/**
 * Midnite Creator — media-core's shell with the Docs and Images tab features, composed over the
 * frame as its own app: the frame chrome, a query client for the media store's cache, and the
 * three host ports Creator implements (`compose/creator-host.tsx`), nested.
 */
export function CreatorApp() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={CREATOR_CHROME}>
        <MediaHostProvider host={CREATOR_MEDIA_HOST}>
          <DocsHostProvider host={CREATOR_DOCS_HOST}>
            <ImagesHostProvider host={CREATOR_IMAGES_HOST}>
              <CreatorHome />
            </ImagesHostProvider>
          </DocsHostProvider>
        </MediaHostProvider>
        <CreatorDialogHost />
      </FrameChromeProvider>
    </QueryClientProvider>
  );
}
