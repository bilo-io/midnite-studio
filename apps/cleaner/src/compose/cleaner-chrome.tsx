import { createFrameChrome } from '@midnite/studio-frame';

const kit = createFrameChrome();

/** The frame chrome Cleaner installs once, at the root (see `FrameChromeProvider`). */
export const CLEANER_CHROME = kit.chrome;

/** Mounts the confirm dialog `CLEANER_CHROME.useDialogs().confirm` parks. */
export const CleanerDialogHost = kit.DialogHost;

export const dialogStore = kit.dialogStore;
