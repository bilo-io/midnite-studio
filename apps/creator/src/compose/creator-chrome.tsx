import { createFrameChrome } from '@midnite/studio-frame';

const kit = createFrameChrome();

/** The frame chrome Creator installs once, at the root (see `FrameChromeProvider`). */
export const CREATOR_CHROME = kit.chrome;

/** Mounts the confirm dialog `CREATOR_CHROME.useDialogs().confirm` parks. */
export const CreatorDialogHost = kit.DialogHost;

export const dialogStore = kit.dialogStore;
