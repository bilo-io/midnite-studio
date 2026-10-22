import { createFrameChrome } from '@midnite/studio-frame';

const kit = createFrameChrome();

/** The frame chrome Vanguard installs once, at the root (see `FrameChromeProvider`). */
export const VANGUARD_CHROME = kit.chrome;

/** Mounts the confirm dialog `VANGUARD_CHROME.useDialogs().confirm` parks. */
export const VanguardDialogHost = kit.DialogHost;

export const dialogStore = kit.dialogStore;
