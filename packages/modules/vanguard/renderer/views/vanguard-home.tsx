import { Suspense, lazy } from 'react';
import { LuShield } from 'react-icons/lu';

import { vanguardViews } from '@midnite/studio-feature-vanguard/renderer';

import { VANGUARD_APP } from '../vanguard-manifest';

// The feature's one view, kept in its own lazy chunk as the feature intends.
const VanguardPage = lazy(() => vanguardViews.vanguard().then((component) => ({ default: component })));

/** What Vanguard shows on open: the accent mark and name on top, the feature's view below. */
export function VanguardHome() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ backgroundColor: VANGUARD_APP.accent }}>
          <LuShield className="h-4 w-4" />
        </span>
        <p className="text-sm font-semibold leading-tight">{VANGUARD_APP.name}</p>
      </header>
      <main className="min-h-0 flex-1 overflow-auto" aria-label="Vanguard">
        <Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Loading Vanguard…</p>}>
          <VanguardPage />
        </Suspense>
      </main>
    </div>
  );
}
