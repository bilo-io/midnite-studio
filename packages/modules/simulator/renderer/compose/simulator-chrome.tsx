import { createFrameChrome } from '@midnite/studio-frame';

const kit = createFrameChrome();

/** The frame chrome Simulator installs once, at its pane root (see `FrameChromeProvider`). */
export const SIMULATOR_CHROME = kit.chrome;

/** Mounts the confirm dialog `SIMULATOR_CHROME.useDialogs().confirm` parks. */
export const SimulatorDialogHost = kit.DialogHost;

export const dialogStore = kit.dialogStore;
