import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { ApiClientHostProvider } from '@midnite/studio-feature-api-client/renderer';
import { DatabaseHostProvider } from '@midnite/studio-feature-database/renderer';
import { ForgeHostProvider } from '@midnite/studio-feature-forge/renderer';
import { SessionsHostProvider } from '@midnite/studio-feature-sessions/renderer';
import { TasksHostProvider } from '@midnite/studio-feature-tasks/renderer';
import { TestsHostProvider, useTestsStream } from '@midnite/studio-feature-tests/renderer';
import { ReportIssueHost } from '@midnite/studio-feature-report/renderer';
import { FrameChromeProvider, GitHostProvider } from '@midnite/studio-frame';

import { CODER_CHROME, CoderDialogHost } from './compose/coder-chrome';
import {
  CODER_API_CLIENT_HOST,
  CODER_DATABASE_HOST,
  CODER_FORGE_HOST,
  CODER_SESSIONS_HOST,
  CODER_TESTS_HOST,
} from './compose/coder-hosts';
import { CODER_GIT_HOST } from './compose/git-host';
import { CODER_TASKS_HOST } from './compose/tasks-host';
import { CoderHome } from './views/coder-home';

/** A run's output and result arrive whether or not the Tests view is mounted — Studio's root does the same. */
function TestsStream() {
  useTestsStream();
  return null;
}

/**
 * Midnite Coder — the forge, tests, API client, Database, Sessions and Tasks features composed over the frame as
 * their own app: the frame chrome, each feature's host port, the frame's git host (the read-only Graph tab) and the
 * query client their hooks read through. The host providers nest rather than sit side by side — siblings
 * would each render `{children}`, mounting the app twice.
 */
export function CoderApp() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={CODER_CHROME}>
        <ForgeHostProvider host={CODER_FORGE_HOST}>
          <TestsHostProvider host={CODER_TESTS_HOST}>
            <ApiClientHostProvider host={CODER_API_CLIENT_HOST}>
              <DatabaseHostProvider host={CODER_DATABASE_HOST}>
                <GitHostProvider host={CODER_GIT_HOST}>
                  <SessionsHostProvider host={CODER_SESSIONS_HOST}>
                    <TasksHostProvider host={CODER_TASKS_HOST}>
                      <TestsStream />
                      <CoderHome />
                      <ReportIssueHost app="midnite-coder" />
                      <CoderDialogHost />
                    </TasksHostProvider>
                  </SessionsHostProvider>
                </GitHostProvider>
              </DatabaseHostProvider>
            </ApiClientHostProvider>
          </TestsHostProvider>
        </ForgeHostProvider>
      </FrameChromeProvider>
    </QueryClientProvider>
  );
}
