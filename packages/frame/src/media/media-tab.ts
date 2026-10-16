import type { MediaTab } from '@midnite/studio-shared';
import type { ComponentType } from 'react';

import type { IconComponent } from '../chrome/types';

/**
 * The media tab registry's contract (Phase 113 Theme Q).
 *
 * Media is one placement folder split across three apps (Creator, Media,
 * Gamer), so its tabs are separate feature packages that may not import one
 * another — nor the shell (`media-core`) that renders them. What they share is
 * this type: each tab feature exports one descriptor, the composing app lists
 * the descriptors it wants in strip order, and media-core's `MediaShell`
 * renders exactly those. Studio lists all of them; Creator only its own.
 *
 * It lives in the frame because a descriptor carries a React component, which
 * `shared` (zod only) cannot hold. The frame holds the type and nothing that
 * implements it.
 */
export type MediaTabDescriptor = {
  id: MediaTab;
  /** The strip tooltip, the active tab's inline label, and the noun in empty states ("Docs live in…"). */
  label: string;
  icon: IconComponent;
  /** The tab body. Only the active tab is mounted. */
  Component: ComponentType;
};

/** The element ids the strip and the panel share (WAI-ARIA tab ↔ tabpanel). */
export const mediaTabId = (tab: MediaTab): string => `media-tab-${tab}`;
export const mediaPanelId = (tab: MediaTab): string => `media-panel-${tab}`;
