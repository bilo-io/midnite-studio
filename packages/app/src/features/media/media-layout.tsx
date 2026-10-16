// Moved to media-core — `packages/features/media-core/renderer` (Phase 113 Theme Q).
import type { MediaTab } from '@midnite/studio-shared';

import { mediaPanelId, type MediaPane } from '@midnite/studio-frame';

import { useUiStore } from '../../store/ui-store';

export { MediaLayout, MediaPaneToggles, useOpenMediaPane, type MediaLayoutProps } from '@midnite/studio-feature-media-core/renderer';

/**
 * Studio's callable-anywhere form of media-core's `useOpenMediaPane` — the
 * tabs still in `packages/app` (Audio, Models) call it from handlers, and
 * Studio's pane state is its own `ui-store`. A feature tab uses the kit's hook.
 */
export function openMediaPane(tab: MediaTab, pane: MediaPane, { focus = true } = {}): void {
  useUiStore.getState().setMediaPaneCollapsed(tab, pane, false);
  if (!focus) return;
  requestAnimationFrame(() => {
    const root = document.getElementById(mediaPanelId(tab))?.querySelector(`[data-media-pane="${pane}"]`);
    const target = root?.querySelector<HTMLElement>(
      'textarea, input, select, button, [tabindex]:not([tabindex="-1"])',
    );
    target?.focus();
  });
}
