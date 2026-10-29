import { createFrameChrome } from '@midnite/studio-frame';

const kit = createFrameChrome();

/** The frame chrome Gamer installs once, at the root (see `FrameChromeProvider`). */
export const GAMER_CHROME = kit.chrome;

/** Mounts the confirm dialog `GAMER_CHROME.useDialogs().confirm` parks. */
export const GamerDialogHost = kit.DialogHost;

export const dialogStore = kit.dialogStore;
