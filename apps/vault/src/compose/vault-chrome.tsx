import { createFrameChrome } from '@midnite/studio-frame';

const kit = createFrameChrome();

/** The frame chrome Vault installs once, at the root (see `FrameChromeProvider`). */
export const VAULT_CHROME = kit.chrome;

/** Mounts the confirm dialog `VAULT_CHROME.useDialogs().confirm` parks. */
export const VaultDialogHost = kit.DialogHost;

export const dialogStore = kit.dialogStore;
