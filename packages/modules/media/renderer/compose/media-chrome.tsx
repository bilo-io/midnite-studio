import { createFrameChrome } from '@midnite/studio-frame';

const kit = createFrameChrome();

/** The frame chrome Media installs once, at the root (see `FrameChromeProvider`). */
export const MEDIA_CHROME = kit.chrome;

/** Mounts the confirm dialog `MEDIA_CHROME.useDialogs().confirm` parks (removing a library folder). */
export const MediaDialogHost = kit.DialogHost;
