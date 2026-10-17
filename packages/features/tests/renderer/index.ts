import type { ComponentType } from 'react';

import type { TestsManifest } from '../manifest';

/**
 * The tests feature's renderer half (Phase 113 Theme O): the Tests view, its
 * run store and output stream, and the discovery/trust/run hooks. Needs the
 * frame (bridge, chrome port, resizable panes) and its own {@link TestsHost}.
 */
export { testsManifest, type TestsManifest } from '../manifest';
export { TestsHostProvider, useTestsHost, type TestsHost, type TestsPaneSize } from './host';
export * from './tests-queries';
// The run store and the window-lifetime output stream the app mounts (the status bar reads the verdict).
export { activeRunId, useTestsStore } from './tests-store';
export { useTestsStream } from './use-tests-stream';

type ViewIds = TestsManifest['views'][number]['id'];

/** Each view as a loader, so the composer keeps it in its own lazy chunk. */
export const testsViews = {
  tests: () => import('./tests-view').then((m) => m.TestsView),
} satisfies Record<ViewIds, () => Promise<ComponentType>>;
