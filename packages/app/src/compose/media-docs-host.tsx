import type { DocsHost } from '@midnite/studio-feature-media-docs/renderer';

import { DocThreadPanel } from '../features/media/doc/doc-thread-panel';
import { useUiStore } from '../store/ui-store';

/**
 * Studio's side of the Docs feature's host port (Phase 113 Theme Q).
 *
 * The last-edited doc per repository stays in `ui-store`'s `mediaLastDoc`, so
 * no stored key moved. The AI thread pane is Studio's own
 * (`features/media/doc/doc-thread-panel.tsx`: agents, the ai-thread composer,
 * voice).
 *
 * Installed by Studio's Media view (`features/media/media-view.tsx`), not by
 * `StudioProviders`: the tabs render nowhere else, and the view is a lazy
 * chunk, so the AI chrome this host carries stays out of the entry chunk.
 */

export const STUDIO_DOCS_HOST = {
  getLastDoc: (repoId) => useUiStore.getState().mediaLastDoc[repoId],
  setLastDoc: (repoId, doc) => useUiStore.getState().setMediaLastDoc(repoId, doc),
  ThreadPanel: DocThreadPanel,
} satisfies DocsHost;
