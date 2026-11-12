import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { LedgerWorkspace, type LedgerTab } from '@midnite/studio-feature-ledger/renderer';
import { FrameChromeProvider, createFrameChrome } from '@midnite/studio-frame';

const kit = createFrameChrome();

/** `accountant.<tab>` → the workspace tab; an unknown view lands on Overview. */
export function tabOfView(view: string): LedgerTab {
  const tab = view.replace(/^accountant\./, '');
  return (['overview', 'journal', 'accounts', 'reports', 'tax', 'import'] as const).find((t) => t === tab) ?? 'overview';
}

/**
 * Accountant as a pane inside a host's shell: the books workspace for the active view, over its own query
 * client and frame chrome. The host's rail drives the tab, so the workspace shows no strip of its own.
 */
export function AccountantPane({ view }: { view: string; onView: (view: string) => void }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={kit.chrome}>
        <LedgerWorkspace tab={tabOfView(view)} showTabs={false} />
        <kit.DialogHost />
      </FrameChromeProvider>
    </QueryClientProvider>
  );
}
