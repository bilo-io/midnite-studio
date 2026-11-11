import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { FrameChromeProvider } from '@midnite/studio-frame';

import { STARTUP_CHROME, StartupDialogHost } from './compose/startup-chrome';
import { StartupHome } from './views/startup-home';

/**
 * Startup as a pane inside a host's shell: the active view over the module's own chrome and query client, no
 * `ReportIssueHost` — the host owns the one entry.
 */
export function StartupPane({ view }: { view: string; onView: (view: string) => void }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={STARTUP_CHROME}>
        <StartupHome view={view} />
        <StartupDialogHost />
      </FrameChromeProvider>
    </QueryClientProvider>
  );
}
