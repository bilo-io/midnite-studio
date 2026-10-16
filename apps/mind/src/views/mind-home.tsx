import { Suspense, lazy } from 'react';
import { PiBrainFill } from 'react-icons/pi';

import { notesViews } from '@midnite/studio-feature-notes/renderer';

import { MIND_APP } from '../mind-manifest';

// The notes view, kept in its own lazy chunk as the feature intends.
const NotesPage = lazy(() => notesViews.notes().then((component) => ({ default: component })));

/** What Mind shows on open: the accent mark and name on top, the feature's view below. */
export function MindHome() {
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
        {/*
          Knowledge is the frame's graph view, and it is not composable here yet: its renderer still
          lives in packages/app and reads that app's stores (ui-store, appearance, status), so
          composing it would drag Studio's renderer in. A labelled placeholder, not a broken tab.
        */}
        <span
          data-testid="mind-knowledge-placeholder"
          title="Knowledge needs the frame's graph view, which has not been extracted from Studio yet."
          className="ml-auto rounded-md border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground"
        >
          Knowledge — coming
        </span>
      </header>
      <main className="flex min-h-0 flex-1 flex-col" aria-label="Notes">
        <Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Loading your notes…</p>}>
          <NotesPage />
        </Suspense>
      </main>
    </div>
  );
}
