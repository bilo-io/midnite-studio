import { createFrameChrome } from '@midnite/studio-frame';

const kit = createFrameChrome();

/** The frame chrome Mind installs once, at the root (see `FrameChromeProvider`). */
export const MIND_CHROME = kit.chrome;

/** Mounts the confirm dialog `MIND_CHROME.useDialogs().confirm` parks. */
export const MindDialogHost = kit.DialogHost;

export const dialogStore = kit.dialogStore;
