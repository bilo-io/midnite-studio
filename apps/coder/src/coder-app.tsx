import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { ForgeHostProvider } from '@midnite/studio-feature-forge/renderer';
import { TestsHostProvider, useTestsStream } from '@midnite/studio-feature-tests/renderer';
import { FrameChromeProvider, GitHostProvider } from '@midnite/studio-frame';

import { CODER_CHROME, CoderDialogHost } from './compose/coder-chrome';
import { CODER_FORGE_HOST, CODER_TESTS_HOST } from './compose/coder-hosts';
import { CODER_GIT_HOST } from './compose/git-host';
import { CoderHome } from './views/coder-home';

/** A run's output and result arrive whether or not the Tests view is mounted — Studio's root does the same. */
function TestsStream() {
  useTestsStream();
  return null;
}

/**
 * Midnite Coder — the forge and tests features composed over the frame as their own app: the frame
 * chrome, each feature's host port, the frame's git host (the read-only Graph tab) and the query client
 * their hooks read through. The host providers nest rather than sit side by side — siblings would each
 * render `{children}`, mounting the app twice.
 */
export function CoderApp() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={CODER_CHROME}>
        <ForgeHostProvider host={CODER_FORGE_HOST}>
          <TestsHostProvider host={CODER_TESTS_HOST}>
            <GitHostProvider host={CODER_GIT_HOST}>
              <TestsStream />
              <CoderHome />
              <CoderDialogHost />
            </GitHostProvider>
          </TestsHostProvider>
        </ForgeHostProvider>
      </FrameChromeProvider>
    </QueryClientProvider>
  );
}
