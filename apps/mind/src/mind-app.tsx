import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ReportIssueHost } from '@midnite/studio-feature-report/renderer';
import { FrameChromeProvider, KnowledgeHostProvider } from '@midnite/studio-frame';
import { NotesHostProvider } from '@midnite/studio-feature-notes/renderer';

import { MIND_CHROME, MindDialogHost } from './compose/mind-chrome';
import { MIND_KNOWLEDGE_HOST } from './compose/knowledge-host';
import { MIND_HOST } from './compose/mind-host';
import { MindHome } from './views/mind-home';

/**
 * Midnite Mind — the notes feature composed over the frame as its own app:
 * the frame chrome, the notes host port (`compose/mind-host.tsx`) and the frame's Knowledge host port
 * (`compose/knowledge-host.tsx`), both implemented over Mind's one notebook. Everything is mounted inside
 * these providers; nothing sits beside them.
 */
// The Knowledge view's graph reads are react-query queries; the notes tab does not use it.
const queryClient = new QueryClient();

export function MindApp() {
  return (
    <QueryClientProvider client={queryClient}>
    <FrameChromeProvider chrome={MIND_CHROME}>
      <NotesHostProvider host={MIND_HOST}>
        <KnowledgeHostProvider host={MIND_KNOWLEDGE_HOST}>
          <MindHome />
        </KnowledgeHostProvider>
      </NotesHostProvider>
      <MindDialogHost />
      <ReportIssueHost app="midnite-mind" />
    </FrameChromeProvider>
    </QueryClientProvider>
  );
}
