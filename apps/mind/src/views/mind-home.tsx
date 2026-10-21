import { Suspense, lazy, useState } from 'react';
import { PiBrainFill } from 'react-icons/pi';

import { notesViews } from '@midnite/studio-feature-notes/renderer';

import { MIND_APP } from '../mind-manifest';

// Each tab is its own lazy chunk: Knowledge pulls sigma and graphology (~0.5 MB), which a notes-only
// session never pays for.
const NotesPage = lazy(() => notesViews.notes().then((component) => ({ default: component })));
const KnowledgePage = lazy(() =>
  import('@midnite/studio-frame/knowledge').then((m) => ({ default: m.KnowledgeView })),
);

type Tab = 'notes' | 'knowledge';
const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'notes', label: 'Notes' },
  { id: 'knowledge', label: 'Knowledge' },
];

/** What Mind shows on open: the accent mark and name on top, then a Notes tab and a Knowledge tab. */
export function MindHome() {
  const [tab, setTab] = useState<Tab>('notes');
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
          {TABS.map(({ id, label }) => (
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
              {label}
            </button>
          ))}
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col" aria-label={tab === 'notes' ? 'Notes' : 'Knowledge'}>
        <Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Loading…</p>}>
          {tab === 'notes' ? <NotesPage /> : <KnowledgePage />}
        </Suspense>
      </main>
    </div>
  );
}
