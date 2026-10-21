import { createFrameChrome } from '@midnite/studio-frame';

const kit = createFrameChrome();

/** The frame chrome Coder installs once, at the root (see `FrameChromeProvider`). */
export const CODER_CHROME = kit.chrome;

/** Mounts the confirm and prompt dialogs `CODER_CHROME.useDialogs()` parks. */
export const CoderDialogHost = kit.DialogHost;

export const dialogStore = kit.dialogStore;
