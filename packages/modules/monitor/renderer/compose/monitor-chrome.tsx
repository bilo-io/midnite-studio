import { createFrameChrome } from '@midnite/studio-frame';

const kit = createFrameChrome();

/** The frame chrome Monitor installs once, at the root (see `FrameChromeProvider`). */
export const MONITOR_CHROME = kit.chrome;

/** Mounts the confirm dialog `MONITOR_CHROME.useDialogs().confirm` parks. */
export const MonitorDialogHost = kit.DialogHost;

export const dialogStore = kit.dialogStore;
