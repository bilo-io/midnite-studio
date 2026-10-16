import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { ChatsHostProvider } from '@midnite/studio-feature-chats/renderer';
import { CouncilsHostProvider } from '@midnite/studio-feature-councils/renderer';
import { ModelsHostProvider, useRefetchModelsOnFocus, useRefetchModelsOnPullDone } from '@midnite/studio-feature-models/renderer';
import { FrameChromeProvider } from '@midnite/studio-frame';

import { AGENTS_CHROME, AgentsDialogHost } from './compose/agents-chrome';
import { AGENTS_CHATS_HOST, AGENTS_COUNCILS_HOST, AGENTS_MODELS_HOST } from './compose/agents-hosts';
import { AgentsHome } from './views/agents-home';

/** The model list refetches when a pull finishes and when the window regains focus — Studio's root does the same. */
function ModelsRefetch() {
  useRefetchModelsOnPullDone();
  useRefetchModelsOnFocus();
  return null;
}

/**
 * Midnite Agents — the chats, councils and models features composed over the frame as their own app:
 * the frame chrome, each feature's host port (plain chrome, no app state) and the query client their
 * hooks read through. The three host providers nest rather than sit side by side — siblings would each
 * render `{children}`, mounting the app twice.
 */
export function AgentsApp() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={AGENTS_CHROME}>
        <ModelsHostProvider host={AGENTS_MODELS_HOST}>
          <CouncilsHostProvider host={AGENTS_COUNCILS_HOST}>
            <ChatsHostProvider host={AGENTS_CHATS_HOST}>
              <ModelsRefetch />
              <AgentsHome />
              <AgentsDialogHost />
            </ChatsHostProvider>
          </CouncilsHostProvider>
        </ModelsHostProvider>
      </FrameChromeProvider>
    </QueryClientProvider>
  );
}
