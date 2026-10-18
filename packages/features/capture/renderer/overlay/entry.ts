import type { CaptureOverlayBridge } from '@midnite/studio-shared';

import { mountCaptureOverlay, OVERLAY_GLOBAL_NAME } from './overlay-page';

/**
 * The overlay page's script (`capture-overlay.js`, an iife each composer's esbuild step builds next to
 * `capture-overlay.html`). The overlay preload exposes exactly the three region calls under
 * {@link OVERLAY_GLOBAL_NAME} and nothing else; without it (opened anywhere but the overlay window) the
 * page does nothing.
 */

const api = (window as unknown as Record<string, CaptureOverlayBridge | undefined>)[
  OVERLAY_GLOBAL_NAME
];
if (api) mountCaptureOverlay(document.body, api);
