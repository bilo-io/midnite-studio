import { mediaKit } from '@midnite/studio-feature-media-core/renderer';
import { MediaKitProvider } from '@midnite/studio-frame';
import type { ReactNode } from 'react';

import { StudioMediaTabHosts } from '../features/media/media-view';

/**
 * What a Media tab component needs around it when a test renders it on its own rather than through
 * `MediaView`: media-core's kit and Studio's tab hosts (every composed tab's among them). `renderView`
 * already supplies the frame chrome, the media host and the query client.
 */
export function StudioTabHarness({ children }: { children: ReactNode }) {
  return (
    <MediaKitProvider kit={mediaKit}>
      <StudioMediaTabHosts>{children}</StudioMediaTabHosts>
    </MediaKitProvider>
  );
}
