import { createFrameChrome } from '@midnite/studio-frame';

const kit = createFrameChrome();

/** The frame chrome Agents installs once, at the root (see `FrameChromeProvider`). */
export const AGENTS_CHROME = kit.chrome;

/** Mounts the confirm and prompt dialogs `AGENTS_CHROME.useDialogs()` parks. */
export const AgentsDialogHost = kit.DialogHost;

export const dialogStore = kit.dialogStore;
