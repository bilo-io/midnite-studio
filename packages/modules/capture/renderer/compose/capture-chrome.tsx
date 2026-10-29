import { createFrameChrome } from '@midnite/studio-frame';

const kit = createFrameChrome();

/** The frame chrome Capture installs once, at the root (see `FrameChromeProvider`). */
export const CAPTURE_CHROME = kit.chrome;

/** Mounts the confirm dialog `CAPTURE_CHROME.useDialogs().confirm` parks (delete, clear history). */
export const CaptureDialogHost = kit.DialogHost;
