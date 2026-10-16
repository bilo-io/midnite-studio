import { AudioHostProvider } from '@midnite/studio-feature-media-audio/renderer';
import { DocsHostProvider } from '@midnite/studio-feature-media-docs/renderer';
import { ImagesHostProvider } from '@midnite/studio-feature-media-images/renderer';
import { VideoHostProvider } from '@midnite/studio-feature-media-video/renderer';
import { MediaShell } from '@midnite/studio-feature-media-core/renderer';
import type { ReactNode } from 'react';

import { STUDIO_AUDIO_HOST } from '../../compose/media-audio-host';
import { STUDIO_DOCS_HOST } from '../../compose/media-docs-host';
import { STUDIO_IMAGES_HOST } from '../../compose/media-images-host';
import { STUDIO_VIDEO_HOST } from '../../compose/media-video-host';
import { STUDIO_MEDIA_TABS } from '../../compose/media-tabs';

/**
 * The hosts of the media tab features Studio composes (Phase 113 Theme Q),
 * nested. Here rather than in `StudioProviders` because they carry Studio's
 * AI chrome, and the Media view is a lazy chunk; a test that renders a tab
 * on its own wraps it in this too.
 */
export function StudioMediaTabHosts({ children }: { children: ReactNode }) {
  return (
    <DocsHostProvider host={STUDIO_DOCS_HOST}>
      <ImagesHostProvider host={STUDIO_IMAGES_HOST}>
        <AudioHostProvider host={STUDIO_AUDIO_HOST}>
          <VideoHostProvider host={STUDIO_VIDEO_HOST}>{children}</VideoHostProvider>
        </AudioHostProvider>
      </ImagesHostProvider>
    </DocsHostProvider>
  );
}

/**
 * Studio's Media page (Phase 99 Theme A) — since Phase 113 Theme Q it is
 * media-core's `MediaShell` over Studio's registry: all nine tabs, in the
 * order they have always had, each rendering through `MediaLayout`.
 */
export function MediaView() {
  return (
    <StudioMediaTabHosts>
      <MediaShell tabs={STUDIO_MEDIA_TABS} />
    </StudioMediaTabHosts>
  );
}
