import { MediaHostProvider } from '@midnite/studio-feature-media-core/renderer';
import { LibraryHostProvider } from '@midnite/studio-feature-media-library/renderer';
import { FrameChromeProvider } from '@midnite/studio-frame';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { MEDIA_CHROME, MediaDialogHost } from './compose/media-chrome';
import { MEDIA_LIBRARY_HOST, MEDIA_MEDIA_HOST } from './compose/media-host';
import { MediaHome } from './views/media-home';

/**
 * Midnite Media — media-core's shell with the Library tab feature, composed over the frame as its own
 * app: the frame chrome, a query client for the library's cache, and the two host ports Media implements
 * (`compose/media-host.tsx`), nested.
 */
export function MediaApp() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={MEDIA_CHROME}>
        <MediaHostProvider host={MEDIA_MEDIA_HOST}>
          <LibraryHostProvider host={MEDIA_LIBRARY_HOST}>
            <MediaHome />
          </LibraryHostProvider>
        </MediaHostProvider>
        <MediaDialogHost />
      </FrameChromeProvider>
    </QueryClientProvider>
  );
}
