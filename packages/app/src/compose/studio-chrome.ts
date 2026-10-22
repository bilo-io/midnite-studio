import type { FrameChrome } from '@midnite/studio-frame';

import { ConfirmDialog } from '../components/confirm-dialog';
import { useDialogs } from '../components/dialog-host';
import { IconButton } from '../components/icon-button';
import { Modal } from '../components/modal';
import { PageDetachMark } from '../components/page-detach-mark';

/**
 * Studio's implementations of the frame's chrome port (Phase 113 Theme C).
 *
 * `satisfies FrameChrome` is the compile-time half of the port's contract: if
 * one of these components stops accepting the props the frame promises a
 * feature (`frame/src/chrome/types.ts`), this line fails `app:typecheck`.
 */
export const STUDIO_CHROME = {
  IconButton,
  ConfirmDialog,
  useDialogs,
  PageDetachMark,
  // A feature's dialog (the report feature's) joins Studio's dismissal stack and occluder count.
  Modal,
} as const satisfies FrameChrome;
