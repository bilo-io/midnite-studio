import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { FinanceHostProvider } from '@midnite/studio-feature-finance/renderer';
import { ReportIssueHost } from '@midnite/studio-feature-report/renderer';
import { FrameChromeProvider, SuiteAppShell } from '@midnite/studio-frame';

import { MONEY_CHROME, MoneyDialogHost } from './compose/money-chrome';
import { MONEY_FINANCE_HOST } from './compose/money-host';
import { MONEY_APP } from './money-manifest';
import { MoneyHome } from './views/money-home';

/**
 * Midnite Money — the finance feature composed over the frame as its own app inside the suite shell (Phase 123 Theme H): the frame chrome,
 * the feature's host port (plain chrome, no app state) and the query client its widgets read through.
 */
export function MoneyApp() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={MONEY_CHROME}>
        <FinanceHostProvider host={MONEY_FINANCE_HOST}>
          <SuiteAppShell app="money" name={MONEY_APP.name} accent={MONEY_APP.accent} nav={MONEY_APP.nav} home={MONEY_APP.home}>
            {() => <MoneyHome />}
          </SuiteAppShell>
          <MoneyDialogHost />
          <ReportIssueHost app="midnite-money" />
        </FinanceHostProvider>
      </FrameChromeProvider>
    </QueryClientProvider>
  );
}
