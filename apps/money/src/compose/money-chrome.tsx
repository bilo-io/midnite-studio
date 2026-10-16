import { createFrameChrome } from '@midnite/studio-frame';

const kit = createFrameChrome();

/** The frame chrome Money installs once, at the root (see `FrameChromeProvider`). */
export const MONEY_CHROME = kit.chrome;

/** Mounts the confirm dialog `MONEY_CHROME.useDialogs().confirm` parks. */
export const MoneyDialogHost = kit.DialogHost;

export const dialogStore = kit.dialogStore;
