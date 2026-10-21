import { useMemo } from 'react';

import { useFrameChrome, type FrameDialogs, type IconButtonProps } from '@midnite/studio-frame';

import {
  useApiClientHost,
  type ApiClientCodeFieldProps,
  type ApiClientPopoverProps,
  type ApiClientTreeSectionProps,
} from './host';

/**
 * The chrome the API client draws, resolved through the installed ports on each render (Phase 113
 * Theme O) — the forge and chats features' `ui.tsx` pattern.
 *
 * The views imported these straight from the app's `components/`. The wrappers keep those call
 * sites as they were — same names, same props — while the implementation is whichever the
 * composing app installed. The host object is stable, so each wrapper's component keeps its
 * identity and nothing remounts.
 */

export function IconButton(props: IconButtonProps) {
  const { IconButton: Impl } = useFrameChrome();
  return <Impl {...props} />;
}

type OpenMenu = NonNullable<FrameDialogs['openMenu']>;
type Prompt = NonNullable<FrameDialogs['prompt']>;

/**
 * The dialog host's confirms, notices, prompts and menus. `prompt` and `openMenu` are optional on
 * the port (an app with no menu host leaves them out); this feature is only ever composed by apps
 * that have both — Studio's host and the frame kit's `createDialogs` — so a missing one is a no-op
 * rather than a crash.
 */
export function useDialogs(): Omit<FrameDialogs, 'prompt' | 'openMenu'> & { prompt: Prompt; openMenu: OpenMenu } {
  const dialogs = useFrameChrome().useDialogs();
  return useMemo(
    () => ({ ...dialogs, prompt: dialogs.prompt ?? (() => undefined), openMenu: dialogs.openMenu ?? (() => undefined) }),
    [dialogs],
  );
}

export function Popover(props: ApiClientPopoverProps) {
  const { Popover: Impl } = useApiClientHost();
  return <Impl {...props} />;
}

export function TreeSection(props: ApiClientTreeSectionProps) {
  const { TreeSection: Impl } = useApiClientHost();
  return <Impl {...props} />;
}

/** The code editor — `MonacoField` to the views that always called it that. */
export function MonacoField(props: ApiClientCodeFieldProps) {
  const { CodeField: Impl } = useApiClientHost();
  return <Impl {...props} />;
}

/** Escape closes this while it is open, in the dialog layer. */
export function useDismiss(open: boolean, onDismiss: () => void): void {
  useApiClientHost().useDismiss(open, onDismiss);
}
