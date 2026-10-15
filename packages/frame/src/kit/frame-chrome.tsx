import type { FrameChrome } from '../chrome/chrome-port';
import { createDialogs } from './dialogs';
import { KitIconButton } from './kit-icon-button';

/** The detach mark renders nothing — extracted apps have no detachable pages. */
function NoDetachMark() {
  return null;
}

/**
 * A complete `FrameChrome` for an extracted app, plus the `DialogHost` it must mount
 * once beside its `FrameChromeProvider`. Pass `overrides` to swap any member.
 */
export function createFrameChrome(overrides: Partial<FrameChrome> = {}) {
  const { useDialogs, DialogHost, ConfirmDialog, store } = createDialogs();
  const chrome: FrameChrome = {
    IconButton: KitIconButton,
    ConfirmDialog,
    useDialogs,
    PageDetachMark: NoDetachMark,
    ...overrides,
  };
  return { chrome, DialogHost, dialogStore: store };
}
