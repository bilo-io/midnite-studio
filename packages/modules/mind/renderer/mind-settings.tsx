import { KnowledgeHostProvider, type SettingsPageDef } from '@midnite/studio-frame';
import { LuNetwork } from 'react-icons/lu';

import { MIND_KNOWLEDGE_HOST } from './compose/knowledge-host';
import { MindSettingsPage } from './views/mind-home';

/** The page provides the knowledge host itself: a host's settings render outside the pane's providers. */
function MindKnowledgeSettings() {
  return (
    <KnowledgeHostProvider host={MIND_KNOWLEDGE_HOST}>
      <MindSettingsPage />
    </KnowledgeHostProvider>
  );
}

/** Mind's own Settings page, after the suite's (it was the in-view Settings tab). */
export const MIND_SETTINGS: readonly SettingsPageDef[] = [
  { id: 'app:mind-knowledge', label: 'Knowledge graph', group: 'general', scope: 'app', icon: LuNetwork, Page: MindKnowledgeSettings },
];
