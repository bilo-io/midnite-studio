import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { FinanceHostProvider } from '@midnite/studio-feature-finance/renderer';
import { FrameChromeProvider } from '@midnite/studio-frame';

import { MONEY_CHROME, MoneyDialogHost } from './compose/money-chrome';
import { MONEY_FINANCE_HOST } from './compose/money-host';
import { MoneyHome } from './views/money-home';

/**
 * Midnite Money — the finance feature composed over the frame as its own app: the frame chrome,
 * the feature's host port (plain chrome, no app state) and the query client its widgets read through.
 */
export function MoneyApp() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={MONEY_CHROME}>
        <FinanceHostProvider host={MONEY_FINANCE_HOST}>
          <MoneyHome />
          <MoneyDialogHost />
        </FinanceHostProvider>
      </FrameChromeProvider>
    </QueryClientProvider>
  );
}
