import { Suspense, lazy, useState } from 'react';
import { PiBrainFill } from 'react-icons/pi';

import {
  KnowledgeStylePicker,
  SettingsAccordion,
  useKnowledgeHost,
} from '@midnite/studio-frame';
import { notesViews } from '@midnite/studio-feature-notes/renderer';
import { LuNetwork } from 'react-icons/lu';

import { MIND_APP } from '../mind-manifest';

// Each tab is its own lazy chunk: Knowledge pulls sigma and graphology (~0.5 MB), which a notes-only
// session never pays for.
const NotesPage = lazy(() => notesViews.notes().then((component) => ({ default: component })));
const KnowledgePage = lazy(() =>
  import('@midnite/studio-frame/knowledge').then((m) => ({ default: m.KnowledgeView })),
);

type Tab = 'notes' | 'knowledge' | 'settings';
const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'notes', label: 'Notes' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'settings', label: 'Settings' },
];

function MindSettingsPage() {
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

/** What Mind shows on open: the accent mark and name on top, then a Notes tab, a Knowledge tab, and a Settings tab. */
export function MindHome() {
  const [tab, setTab] = useState<Tab>('notes');
  const label = tab === 'notes' ? 'Notes' : tab === 'knowledge' ? 'Knowledge' : 'Settings';
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: MIND_APP.accent }}
        >
          <PiBrainFill className="h-4 w-4" />
        </span>
        <p className="text-sm font-semibold leading-tight">{MIND_APP.name}</p>
        <div role="tablist" aria-label="Mind" className="ml-auto flex items-center gap-1">
          {TABS.map(({ id, label: tabLabel }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              data-testid={`mind-tab-${id}`}
              onClick={() => setTab(id)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                tab === id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tabLabel}
            </button>
          ))}
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col" aria-label={label}>
        <Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Loading…</p>}>
          {tab === 'notes' ? (
            <NotesPage />
          ) : tab === 'knowledge' ? (
            <KnowledgePage />
          ) : (
            <MindSettingsPage />
          )}
        </Suspense>
      </main>
    </div>
  );
}
