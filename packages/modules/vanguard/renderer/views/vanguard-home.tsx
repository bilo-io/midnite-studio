import { Suspense, lazy } from 'react';

import { vanguardViews } from '@midnite/studio-feature-vanguard/renderer';

// The feature's one view, kept in its own lazy chunk as the feature intends.
const VanguardPage = lazy(() => vanguardViews.vanguard().then((component) => ({ default: component })));

/** The view Vanguard shows inside the shell: the feature's page, which owns its tabs and scroll. */
export function VanguardHome() {
  return (
    <main className="h-full overflow-auto" aria-label="Vanguard">
      <Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Loading Vanguard…</p>}>
        <VanguardPage />
      </Suspense>
    </main>
  );
}
