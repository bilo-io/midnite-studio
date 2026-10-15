import { Suspense, lazy, useState } from 'react';
import { LuSettings, LuX } from 'react-icons/lu';
import { PiSparkleFill } from 'react-icons/pi';

import { useFrameChrome } from '@midnite/studio-frame';
import { optimizerSettingsPages, optimizerViews } from '@midnite/studio-feature-optimizer/renderer';

import { CLEANER_APP } from '../cleaner-manifest';

// The optimizer's one view, kept in its own lazy chunk as the feature intends.
const OptimizerPage = lazy(() => optimizerViews.optimizer().then((component) => ({ default: component })));

/**
 * What Cleaner shows on open: the optimizer's main surface framed as Cleaner —
 * the accent mark and name on top, the optimizer's tabs below, and a Settings
 * panel for the two pages the feature contributes (Trash safety, Optimizer).
 */
export function CleanerHome() {
  const { IconButton } = useFrameChrome();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { trashSafety: TrashSafety, optimizer: OptimizerSettings } = optimizerSettingsPages;

  return (
    <div className="flex h-full flex-col" style={{ ['--accent-cleaner' as string]: CLEANER_APP.accent }}>
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: CLEANER_APP.accent }}
        >
          <PiSparkleFill className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold leading-tight">Cleaner</h1>
          <p className="truncate text-xs text-muted-foreground">{CLEANER_APP.tagline}</p>
        </div>
        <IconButton
          icon={settingsOpen ? LuX : LuSettings}
          label={settingsOpen ? 'Close settings' : 'Cleaner settings'}
          onClick={() => setSettingsOpen((open) => !open)}
        />
      </header>
      <main className="min-h-0 flex-1 overflow-auto" aria-label="Cleaner">
        {settingsOpen ? (
          <div className="mx-auto max-w-2xl space-y-6 p-4">
            <TrashSafety />
            <OptimizerSettings />
          </div>
        ) : (
          <Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Loading the optimizer…</p>}>
            <OptimizerPage />
          </Suspense>
        )}
      </main>
    </div>
  );
}
