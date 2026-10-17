import { useFrameChrome, type GitTooltipProps, type IconButtonProps } from '@midnite/studio-frame';

import {
  useBrowserHost,
  type BrowserContextMenuProps,
  type BrowserDismissOptions,
  type BrowserModalProps,
  type BrowserUiState,
  type BrowserUiStore,
} from './host';

/**
 * The chrome and app state the browser draws on, resolved through the installed ports on each render
 * (Phase 113 Theme L) — the forge feature's `ui.tsx` pattern. The pane and the rail imported these
 * straight from Studio's `components/` and `ui-store`; the wrappers keep those call sites as they were —
 * same names, same props — while the implementation is whichever the composing app installed.
 */

export function IconButton(props: IconButtonProps) {
  const { IconButton: Impl } = useFrameChrome();
  return <Impl {...props} />;
}

export function Modal(props: BrowserModalProps) {
  const { Modal: Impl } = useBrowserHost();
  return <Impl {...props} />;
}

export function Tooltip(props: GitTooltipProps) {
  const { Tooltip: Impl } = useBrowserHost();
  return <Impl {...props} />;
}

export function ContextMenu(props: BrowserContextMenuProps) {
  const { ContextMenu: Impl } = useBrowserHost();
  return <Impl {...props} />;
}

export function MidniteIcon({ className }: { className?: string }) {
  const { MidniteIcon: Impl } = useBrowserHost();
  return <Impl className={className} />;
}

export function BrandMark({ className }: { className?: string }) {
  const { BrandMark: Impl } = useBrowserHost();
  return <Impl className={className} />;
}

export function Wordmark({ className }: { className?: string }) {
  const { Wordmark: Impl } = useBrowserHost();
  return <Impl className={className} />;
}

/** A selector over the app's browser state (Studio: `useUiStore(selector)`). */
export function useBrowserUi<T>(selector: (state: BrowserUiState) => T): T {
  return useBrowserHost().ui(selector);
}

/** The store itself, for `getState()`/`setState()` in event handlers. */
export function useBrowserUiStore(): BrowserUiStore {
  return useBrowserHost().ui;
}

export function useDismiss(active: boolean, onDismiss: () => void, options?: BrowserDismissOptions): void {
  useBrowserHost().useDismiss(active, onDismiss, options);
}

export function useOccluder(active = true): void {
  useBrowserHost().useOccluder(active);
}

export function usePopoutHeaderLeading(): HTMLElement | null {
  return useBrowserHost().usePopoutHeaderLeading();
}

export function usePopoutHeaderActions(): HTMLElement | null {
  return useBrowserHost().usePopoutHeaderActions();
}

export function useRepos() {
  return useBrowserHost().useRepos();
}

export function useRemotes(repoId: string | null) {
  return useBrowserHost().useRemotes(repoId);
}

export function useDialogs() {
  return useFrameChrome().useDialogs();
}
