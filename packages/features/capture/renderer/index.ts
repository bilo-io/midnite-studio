import type { ComponentType } from 'react';

import type { CaptureManifest } from '../manifest';

/**
 * The capture feature's renderer half (Phase 113 Theme K): the Capture view, its host port (how a
 * capture reaches a chat, a pull-request comment or a Creator project in the composing app), the
 * shortcut-landing hook the app mounts once to bring the view forward when the global chord fires, and
 * `selectCapture` for a composer that lands the view on one capture (Studio's `midnite-studio://capture`).
 *
 * The desktop region overlay's page is not exported here: it is its own tiny script
 * (`renderer/overlay/entry.ts` + `capture-overlay.html`), built by each composer's esbuild step into the
 * overlay window, never into the app bundle.
 */
export { captureManifest, type CaptureManifest } from '../manifest';
export {
  CaptureHostProvider,
  STANDALONE_CAPTURE_HOST,
  useCaptureHost,
  type CaptureCreatorHost,
  type CaptureHost,
  type CapturePrCommentHost,
  type CapturePullRequest,
} from './host';
export { selectCapture, useCaptureShortcutLanding } from './use-capture';
export { PR_COMMENT_PASTE_NOTE } from './send-to';

type ViewIds = CaptureManifest['views'][number]['id'];

/** Each view as a loader, so the composer keeps it in its own lazy chunk. */
export const captureViews = {
  capture: () => import('./capture-page').then((m) => m.CapturePage as ComponentType),
} satisfies Record<ViewIds, () => Promise<ComponentType>>;
