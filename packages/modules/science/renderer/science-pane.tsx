import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { FrameChromeProvider } from '@midnite/studio-frame';

import { SCIENCE_CHROME, ScienceDialogHost } from './compose/science-chrome';
import { NotebooksView } from './views/notebooks-view';
import { TemplatesView } from './views/templates-view';

/**
 * Science as a pane inside a host's shell (Phase 126 Theme A.2): its own chrome and query client, no
 * `ReportIssueHost` — the host owns the one entry.
 */
export function SciencePane({ view, onView }: { view: string; onView: (view: string) => void }) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={SCIENCE_CHROME}>
        {view === 'templates' ? <TemplatesView /> : <NotebooksView onView={onView} />}
        <ScienceDialogHost />
      </FrameChromeProvider>
    </QueryClientProvider>
  );
}
