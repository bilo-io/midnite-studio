import { MediaHostProvider, MediaShell, useMediaHost } from '@midnite/studio-feature-media-core/renderer';
import { LibraryHostProvider } from '@midnite/studio-feature-media-library/renderer';
import { FrameChromeProvider, useSyncedView } from '@midnite/studio-frame';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { MEDIA_CHROME, MediaDialogHost } from './compose/media-chrome';
import { MEDIA_LIBRARY_HOST, MEDIA_MEDIA_HOST } from './compose/media-host';
import { MEDIA_TABS } from './media-manifest';

/** The rail's row is the media tab, which lives in the media host's store — the two stay one value. */
function MediaTabSync({ view, onView }: { view: string; onView: (view: string) => void }) {
  const [tab, setTab] = useMediaHost().useActiveTab();
  useSyncedView(view, onView, tab, (next) => setTab(next as typeof tab));
  return null;
}

/**
 * Media as a pane inside a host's shell (Phase 124 Theme E.3): the same host ports as `MediaApp`, the media
 * shell bare, and no `ReportIssueHost` — the host owns the one menu entry.
 */
export function MediaPane({ view, onView }: { view: string; onView: (view: string) => void }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={MEDIA_CHROME}>
        <MediaHostProvider host={MEDIA_MEDIA_HOST}>
          <LibraryHostProvider host={MEDIA_LIBRARY_HOST}>
            <MediaTabSync view={view} onView={onView} />
            <main className="h-full min-h-0" aria-label="Media">
              <MediaShell tabs={MEDIA_TABS} title="Library" bare />
            </main>
          </LibraryHostProvider>
        </MediaHostProvider>
        <MediaDialogHost />
      </FrameChromeProvider>
    </QueryClientProvider>
  );
}
