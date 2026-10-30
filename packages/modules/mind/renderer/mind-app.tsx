import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ReportIssueHost } from '@midnite/studio-feature-report/renderer';
import { FrameChromeProvider, KnowledgeHostProvider, SuiteAppShell, type SettingsPageDef } from '@midnite/studio-frame';
import { LuNetwork } from 'react-icons/lu';
import { NotesHostProvider } from '@midnite/studio-feature-notes/renderer';

import { MIND_CHROME, MindDialogHost } from './compose/mind-chrome';
import { MIND_KNOWLEDGE_HOST } from './compose/knowledge-host';
import { MIND_HOST } from './compose/mind-host';
import { MIND_APP } from './mind-manifest';
import { MindHome, MindSettingsPage } from './views/mind-home';

/**
 * Midnite Mind — the notes feature composed over the frame as its own app:
 * the frame chrome, the notes host port (`compose/mind-host.tsx`) and the frame's Knowledge host port
 * (`compose/knowledge-host.tsx`), both implemented over Mind's one notebook. Everything is mounted inside
 * these providers; nothing sits beside them.
 */
// The Knowledge view's graph reads are react-query queries; the notes tab does not use it.
const queryClient = new QueryClient();

/** Mind's own Settings page, after the suite's (it was the in-view Settings tab). */
const MIND_SETTINGS: readonly SettingsPageDef[] = [
  { id: 'app:mind-knowledge', label: 'Knowledge graph', group: 'general', scope: 'app', icon: LuNetwork, Page: MindSettingsPage },
];

export function MindApp() {
  return (
    <QueryClientProvider client={queryClient}>
    <FrameChromeProvider chrome={MIND_CHROME}>
      <NotesHostProvider host={MIND_HOST}>
        <KnowledgeHostProvider host={MIND_KNOWLEDGE_HOST}>
          <SuiteAppShell
            app="mind"
            name={MIND_APP.name}
            accent={MIND_APP.accent}
            nav={MIND_APP.nav}
            home={MIND_APP.home}
            settingsPages={MIND_SETTINGS}
          >
            {(view) => <MindHome view={view} />}
          </SuiteAppShell>
        </KnowledgeHostProvider>
      </NotesHostProvider>
      <MindDialogHost />
      <ReportIssueHost app="midnite-mind" />
    </FrameChromeProvider>
    </QueryClientProvider>
  );
}
