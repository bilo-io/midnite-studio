import { createFrameChrome } from '@midnite/studio-frame';
import { useStore } from 'zustand';

/** Browser's frame chrome: the suite kit — its icon button, confirm, prompt and context menu. */
const kit = createFrameChrome();

export const BROWSER_CHROME = kit.chrome;

/** Mount once beside the provider so `confirm`, `prompt` and `openMenu` show something real. */
export const BrowserDialogHost = kit.DialogHost;

type DialogState = ReturnType<typeof kit.dialogStore.getState>;

/** A selector over the kit's dialog store — whether anything is up, for the native views to hide under it. */
export function BrowserDialogStore<T>(selector: (state: DialogState) => T): T {
  return useStore(kit.dialogStore, selector);
}
