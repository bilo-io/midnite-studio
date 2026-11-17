import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

import { FrameChromeProvider } from '@midnite/studio-frame';

import { STARTUP_CHROME, StartupDialogHost } from '../compose/startup-chrome';

export function Harness({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={STARTUP_CHROME}>
        {children}
        <StartupDialogHost />
      </FrameChromeProvider>
    </QueryClientProvider>
  );
}

export const renderWithChrome = (ui: ReactElement) => render(<Harness>{ui}</Harness>);
