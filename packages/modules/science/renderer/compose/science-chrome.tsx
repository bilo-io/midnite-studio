import { createFrameChrome } from '@midnite/studio-frame';

const kit = createFrameChrome();

/** The frame chrome Science installs once, at the root (see `FrameChromeProvider`). */
export const SCIENCE_CHROME = kit.chrome;

/** Mounts the confirm dialog `SCIENCE_CHROME.useDialogs().confirm` parks. */
export const ScienceDialogHost = kit.DialogHost;

export const dialogStore = kit.dialogStore;
