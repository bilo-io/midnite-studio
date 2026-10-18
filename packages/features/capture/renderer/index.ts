import type { ComponentType } from 'react';

import type { CaptureManifest } from '../manifest';

/**
 * The capture feature's renderer half (Phase 113 Theme K): the Capture view, its host port (how a
 * capture reaches a chat or a Creator project in the composing app) and the shortcut-landing hook the
 * app mounts once to bring the view forward when the global chord fires.
 */
export { captureManifest, type CaptureManifest } from '../manifest';
export {
  CaptureHostProvider,
  STANDALONE_CAPTURE_HOST,
  useCaptureHost,
  type CaptureCreatorHost,
  type CaptureHost,
} from './host';
export { useCaptureShortcutLanding } from './use-capture';
export { PR_COMMENT_DEFERRED } from './send-to';

type ViewIds = CaptureManifest['views'][number]['id'];

/** Each view as a loader, so the composer keeps it in its own lazy chunk. */
export const captureViews = {
  capture: () => import('./capture-page').then((m) => m.CapturePage as ComponentType),
} satisfies Record<ViewIds, () => Promise<ComponentType>>;
