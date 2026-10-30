import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { BrowserHostProvider } from '@midnite/studio-feature-browser/renderer';
import { ReportIssueHost } from '@midnite/studio-feature-report/renderer';
import { FrameChromeProvider, SuiteAppShell } from '@midnite/studio-frame';

import { BrowserShell } from './components/browser-shell';
import { BROWSER_CHROME, BrowserDialogHost } from './compose/browser-chrome';
import { BROWSER_APP_HOST, useBrowserOccluder } from './compose/browser-host';
import { BROWSER_APP } from './browser-manifest';

/** The shell around the page; Settings is DOM, so while it is open it occludes the native views. */
function BrowserWindow() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  useBrowserOccluder(settingsOpen);
  return (
    <SuiteAppShell
      app="browser"
      name={BROWSER_APP.name}
      accent={BROWSER_APP.accent}
      nav={BROWSER_APP.nav}
      home={BROWSER_APP.home}
      onSettingsOpenChange={setSettingsOpen}
    >
      {() => <BrowserShell />}
    </SuiteAppShell>
  );
}

/**
 * Midnite Browser — the browser feature composed over the frame as its own app (Phase 113 Theme L): the
 * suite kit's chrome, Browser's answer to the feature's host port, and the query client the feature's
 * hooks read through (the new-tab page's dev-server probe is a query, idle here: there is no repository).
 */
export function BrowserApp() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={BROWSER_CHROME}>
        <BrowserHostProvider host={BROWSER_APP_HOST}>
          <BrowserWindow />
          <ReportIssueHost app="midnite-browser" />
          <BrowserDialogHost />
        </BrowserHostProvider>
      </FrameChromeProvider>
    </QueryClientProvider>
  );
}
