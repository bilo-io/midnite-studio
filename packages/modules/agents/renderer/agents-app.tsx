import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { ChatsHostProvider } from '@midnite/studio-feature-chats/renderer';
import { CouncilsHostProvider } from '@midnite/studio-feature-councils/renderer';
import { WorkflowsHostProvider } from '@midnite/studio-feature-workflows/renderer';
import { ModelsHostProvider, useRefetchModelsOnFocus, useRefetchModelsOnPullDone } from '@midnite/studio-feature-models/renderer';
import { ReportIssueHost } from '@midnite/studio-feature-report/renderer';
import { FrameChromeProvider, SuiteAppShell } from '@midnite/studio-frame';

import { AGENTS_CHROME, AgentsDialogHost } from './compose/agents-chrome';
import { AGENTS_CHATS_HOST, AGENTS_COUNCILS_HOST, AGENTS_MODELS_HOST, AGENTS_WORKFLOWS_HOST } from './compose/agents-hosts';
import { AGENTS_APP } from './agents-manifest';
import { AgentsHome, type ViewId } from './views/agents-home';

/** The model list refetches when a pull finishes and when the window regains focus — Studio's root does the same. */
function ModelsRefetch() {
  useRefetchModelsOnPullDone();
  useRefetchModelsOnFocus();
  return null;
}

/**
 * Midnite Agents (on the suite shell, Phase 123 Theme H) — the chats, councils, workflows and models features (and the MCP Tools view) composed over the frame as their own app:
 * the frame chrome, each feature's host port (plain chrome, no app state) and the query client their
 * hooks read through. The four host providers nest rather than sit side by side — siblings would each
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
              <WorkflowsHostProvider host={AGENTS_WORKFLOWS_HOST}>
                <ModelsRefetch />
                <SuiteAppShell app="agents" name={AGENTS_APP.name} accent={AGENTS_APP.accent} nav={AGENTS_APP.nav} home={AGENTS_APP.home}>
                  {(view) => <AgentsHome view={view as ViewId} />}
                </SuiteAppShell>
                <ReportIssueHost app="midnite-agents" />
                <AgentsDialogHost />
              </WorkflowsHostProvider>
            </ChatsHostProvider>
          </CouncilsHostProvider>
        </ModelsHostProvider>
      </FrameChromeProvider>
    </QueryClientProvider>
  );
}

/**
 * Agents as a pane inside a host's shell (Phase 124 Theme E.3): the same host ports as `AgentsApp`, the active
 * rail view in place of its own shell, and no `ReportIssueHost` — the host owns the one menu entry.
 */
export function AgentsPane({ view }: { view: string; onView?: (view: string) => void }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={AGENTS_CHROME}>
        <ModelsHostProvider host={AGENTS_MODELS_HOST}>
          <CouncilsHostProvider host={AGENTS_COUNCILS_HOST}>
            <ChatsHostProvider host={AGENTS_CHATS_HOST}>
              <WorkflowsHostProvider host={AGENTS_WORKFLOWS_HOST}>
                <ModelsRefetch />
                <AgentsHome view={(AGENTS_APP.views as readonly string[]).includes(view) ? (view as ViewId) : 'chats'} />
                <AgentsDialogHost />
              </WorkflowsHostProvider>
            </ChatsHostProvider>
          </CouncilsHostProvider>
        </ModelsHostProvider>
      </FrameChromeProvider>
    </QueryClientProvider>
  );
}
