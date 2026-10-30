import { MediaHostProvider, MediaShell, useMediaHost } from '@midnite/studio-feature-media-core/renderer';
import { AudioHostProvider } from '@midnite/studio-feature-media-audio/renderer';
import { DocsHostProvider } from '@midnite/studio-feature-media-docs/renderer';
import { SlidesHostProvider } from '@midnite/studio-feature-slides/renderer';
import { VideoHostProvider } from '@midnite/studio-feature-media-video/renderer';
import { ImagesHostProvider } from '@midnite/studio-feature-media-images/renderer';
import { FrameChromeProvider, useSyncedView } from '@midnite/studio-frame';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';

import { CREATOR_CHROME, CreatorDialogHost } from './compose/creator-chrome';
import { CREATOR_AUDIO_HOST, CREATOR_DOCS_HOST, CREATOR_IMAGES_HOST, CREATOR_SLIDES_HOST, CREATOR_VIDEO_HOST, CREATOR_MEDIA_HOST } from './compose/creator-host';
import { CREATOR_TABS } from './creator-tabs';

const SlidesModal = lazy(() => import('@midnite/studio-feature-slides/renderer/modal').then((m) => ({ default: m.SlidesModal })));

/** The rail's row is the media tab: the tab lives in the media host's store, so the two stay one value. */
function CreatorTabSync({ view, onView }: { view: string; onView: (view: string) => void }) {
  const [tab, setTab] = useMediaHost().useActiveTab();
  useSyncedView(view, onView, tab, (next) => setTab(next as typeof tab));
  return null;
}

/**
 * Creator as a pane inside a host's shell (Phase 124 Theme E.3): the same host ports as `CreatorModule`, the
 * media shell without its own tab strip (the host's rail has the tabs), and no `ReportIssueHost` — the host
 * owns the one menu entry.
 */
export function CreatorPane({ view, onView }: { view: string; onView: (view: string) => void }) {
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
                    <CreatorTabSync view={view} onView={onView} />
                    <main className="h-full min-h-0" aria-label="Creator">
                      <MediaShell tabs={CREATOR_TABS} title="Creator" bare />
                    </main>
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
