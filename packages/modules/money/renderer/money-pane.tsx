import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { FinanceHostProvider } from '@midnite/studio-feature-finance/renderer';
import { FrameChromeProvider } from '@midnite/studio-frame';

import { MONEY_CHROME, MoneyDialogHost } from './compose/money-chrome';
import { MONEY_FINANCE_HOST } from './compose/money-host';
import { MoneyHome } from './views/money-home';

/**
 * Money as a pane inside a host's shell: `MoneyApp`'s body without the `SuiteAppShell` — the query client,
 * the frame chrome, the finance host port, the markets board and its confirm dialogs. The host owns the shell
 * and the one Report an Issue entry.
 */
export function MoneyPane() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={MONEY_CHROME}>
        <FinanceHostProvider host={MONEY_FINANCE_HOST}>
          <MoneyHome />
        </FinanceHostProvider>
        <MoneyDialogHost />
      </FrameChromeProvider>
    </QueryClientProvider>
  );
}
