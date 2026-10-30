import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { NotesHostProvider } from '@midnite/studio-feature-notes/renderer';
import { FrameChromeProvider, KnowledgeHostProvider } from '@midnite/studio-frame';

import { MIND_CHROME, MindDialogHost } from './compose/mind-chrome';
import { MIND_KNOWLEDGE_HOST } from './compose/knowledge-host';
import { MIND_HOST } from './compose/mind-host';
import { MindHome } from './views/mind-home';

/**
 * Mind as a pane inside a host's shell (Phase 124 Theme E.3): the notes and knowledge views over Mind's
 * host ports, its own chrome and query client, no `ReportIssueHost` — the host owns the one entry.
 */
export function MindPane({ view }: { view: string; onView: (view: string) => void }) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={MIND_CHROME}>
        <NotesHostProvider host={MIND_HOST}>
          <KnowledgeHostProvider host={MIND_KNOWLEDGE_HOST}>
            <MindHome view={view} />
          </KnowledgeHostProvider>
        </NotesHostProvider>
        <MindDialogHost />
      </FrameChromeProvider>
    </QueryClientProvider>
  );
}
