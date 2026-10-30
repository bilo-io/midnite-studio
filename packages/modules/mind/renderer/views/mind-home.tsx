import { Suspense, lazy } from 'react';

import {
  KnowledgeStylePicker,
  SettingsAccordion,
  useKnowledgeHost,
} from '@midnite/studio-frame';
import { notesViews } from '@midnite/studio-feature-notes/renderer';
import { LuNetwork } from 'react-icons/lu';

// Each tab is its own lazy chunk: Knowledge pulls sigma and graphology (~0.5 MB), which a notes-only
// session never pays for.
const NotesPage = lazy(() => notesViews.notes().then((component) => ({ default: component })));
const KnowledgePage = lazy(() =>
  import('@midnite/studio-frame/knowledge').then((m) => ({ default: m.KnowledgeView })),
);

/** Mind's own Settings page: how the knowledge graph is drawn. */
export function MindSettingsPage() {
  const host = useKnowledgeHost();
  const settings = host.useSettings();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 overflow-y-auto p-4">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Mind · Preferences
        </p>
        <h2 className="text-xl font-semibold tracking-tight">Knowledge Graph Settings</h2>
      </div>
      <SettingsAccordion
        title="Knowledge graph presentation"
        icon={<LuNetwork className="h-4 w-4" />}
        defaultOpen
      >
        <div className="p-3">
          <KnowledgeStylePicker
            activeId={settings.rendererVariant}
            onSelect={(id) => host.setSettings({ rendererVariant: id })}
          />
        </div>
      </SettingsAccordion>
    </div>
  );
}

/**
 * What Mind shows in the shell (Phase 123 Theme H): the rail's rows are Notes and Knowledge, so the page
 * is only the active view. Its own settings page (the knowledge-graph presentation) is `MindSettingsPage`,
 * an app page after the suite's.
 */
export function MindHome({ view }: { view: string }) {
  return (
    <main className="flex h-full min-h-0 flex-col" aria-label={view === 'knowledge' ? 'Knowledge' : 'Notes'}>
      <Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Loading…</p>}>
        {view === 'knowledge' ? <KnowledgePage /> : <NotesPage />}
      </Suspense>
    </main>
  );
}
