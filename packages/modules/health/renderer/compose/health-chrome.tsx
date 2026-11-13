import { createFrameChrome } from '@midnite/studio-frame';

const kit = createFrameChrome();

/** The frame chrome Health installs once, at the root (see `FrameChromeProvider`). */
export const HEALTH_CHROME = kit.chrome;

/** Mounts the confirm dialog `HEALTH_CHROME.useDialogs().confirm` parks. */
export const HealthDialogHost = kit.DialogHost;

export const dialogStore = kit.dialogStore;
