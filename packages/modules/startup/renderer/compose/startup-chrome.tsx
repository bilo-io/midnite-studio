import { createFrameChrome } from '@midnite/studio-frame';

const kit = createFrameChrome();

/** The frame chrome Startup installs once, at the root (see `FrameChromeProvider`). */
export const STARTUP_CHROME = kit.chrome;

/** Mounts the confirm dialog `STARTUP_CHROME.useDialogs().confirm` parks. */
export const StartupDialogHost = kit.DialogHost;
