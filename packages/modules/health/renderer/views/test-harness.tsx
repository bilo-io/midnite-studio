import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

import { FrameChromeProvider } from '@midnite/studio-frame';

import { HEALTH_CHROME, HealthDialogHost } from '../compose/health-chrome';

/** Renders a view inside the Health chrome and a fresh query client (test-only). */
export function renderHealth(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={HEALTH_CHROME}>
        {ui}
        <HealthDialogHost />
      </FrameChromeProvider>
    </QueryClientProvider>,
  );
}
