import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';

import { ForgeHostProvider, type ForgeHost } from './host';
import { createStandaloneForgeHost } from './standalone/standalone-host';

/**
 * For this package's own tests: the feature rendered on its standalone host
 * (plain chrome, a plain diff) and the frame's kit chrome, with any member
 * overridden. Studio's composition tests render under Studio's real providers
 * instead (`packages/app/src/compose/forge/`).
 */
export function testForgeHost(overrides: Partial<ForgeHost> = {}): ForgeHost {
  return {
    ...createStandaloneForgeHost({
      useActiveRepo: () => ({ repoId: 'repo-1' }),
      useForgeKind: () => 'github',
      openExternal: () => undefined,
    }),
    ...overrides,
  };
}

export function renderWithForgeHost(ui: ReactElement, overrides: Partial<ForgeHost> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { chrome, DialogHost } = createFrameChrome();
  return render(
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={chrome}>
        <ForgeHostProvider host={testForgeHost(overrides)}>{ui}</ForgeHostProvider>
        <DialogHost />
      </FrameChromeProvider>
    </QueryClientProvider>,
  );
}
