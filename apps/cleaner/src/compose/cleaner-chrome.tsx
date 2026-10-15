import type { FrameChrome, IconButtonProps } from '@midnite/studio-frame';

import { ConfirmDialog, useCleanerDialogs } from './dialogs';

function IconButton({ icon: Icon, label, onClick, disabled, disabledReason, busy, children }: IconButtonProps) {
  const isDisabled = Boolean(disabled || disabledReason);
  return (
    <button
      type="button"
      aria-label={label}
      title={disabledReason ? `${label} (${disabledReason})` : label}
      aria-disabled={isDisabled}
      aria-busy={busy || undefined}
      disabled={isDisabled}
      onClick={isDisabled ? undefined : onClick}
      className="inline-flex items-center justify-center gap-1 rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

/** Cleaner has no detachable pages, so the frame's detach mark renders nothing. */
function PageDetachMark() {
  return null;
}

/** The frame chrome Cleaner installs once, at the root (see `FrameChromeProvider`). */
export const CLEANER_CHROME: FrameChrome = {
  IconButton,
  ConfirmDialog,
  useDialogs: useCleanerDialogs,
  PageDetachMark,
};
