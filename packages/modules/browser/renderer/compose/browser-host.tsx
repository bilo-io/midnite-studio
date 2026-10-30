import { cloneElement, useEffect, useRef } from 'react';
import { PiGlobeFill } from 'react-icons/pi';
import { SiClaude, SiGooglecalendar, SiSpotify, SiYoutube } from 'react-icons/si';

import type {
  BrowserContextMenuProps,
  BrowserDismissOptions,
  BrowserHost,
  BrowserModalProps,
} from '@midnite/studio-feature-browser/renderer';
import { KitContextMenu, type FrameMenuEntry, type GitTooltipProps } from '@midnite/studio-frame';

import { browserUiStore, useBrowserAppUi } from '../browser-ui-store';

/**
 * Browser's answer to the browser feature's host port. The app state is Browser's own store
 * (`browser-ui-store.ts`); the chrome is the plain suite kit — a native-title tooltip, the kit's context
 * menu, an Escape listener — where Studio lends its dismissal stack, its modal and its brand marks.
 * There are no repositories (the new-tab page shows no repo row), and no popout title bar.
 *
 * Every surface drawn over the page counts itself an occluder while it is up: a tab is a native view,
 * painted above the DOM, so the feature hides it while `occluders > 0` — the same rule Studio's menus
 * and dialogs follow.
 */

/** Counts the calling surface as one over the native views while `active`. */
export function useBrowserOccluder(active = true): void {
  useEffect(() => {
    if (!active) return undefined;
    return browserUiStore.getState().addOccluder();
  }, [active]);
}

type DismissEntry = { blocking: boolean; dismiss: () => void };
/** Open surfaces, oldest first. One window-level Escape listener serves them all. */
const dismissStack: DismissEntry[] = [];

function onEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  // The newest blocking surface first (a menu over the find bar takes the Escape), then the newest passive one.
  const top = [...dismissStack].reverse().find((entry) => entry.blocking) ?? dismissStack[dismissStack.length - 1];
  top?.dismiss();
}

/**
 * Escape closes the surface while it is active — Studio's `useDismiss` rule in small: blocking surfaces
 * take Escape before passive ones, and `occludes` (default: `blocking`) hides the native views under it.
 */
function useBrowserDismiss(active: boolean, onDismiss: () => void, options?: BrowserDismissOptions): void {
  const latest = useRef(onDismiss);
  latest.current = onDismiss;
  const blocking = options?.blocking ?? true;
  const occludes = options?.occludes ?? blocking;
  useEffect(() => {
    if (!active) return undefined;
    const entry: DismissEntry = { blocking, dismiss: () => latest.current() };
    if (dismissStack.length === 0) window.addEventListener('keydown', onEscape);
    dismissStack.push(entry);
    return () => {
      dismissStack.splice(dismissStack.indexOf(entry), 1);
      if (dismissStack.length === 0) window.removeEventListener('keydown', onEscape);
    };
  }, [active, blocking]);
  useBrowserOccluder(active && occludes);
}

function BrowserTooltip({ label, children }: GitTooltipProps) {
  return typeof label === 'string' ? cloneElement(children, { title: label }) : children;
}

function BrowserContextMenu({ position, items, onClose }: BrowserContextMenuProps) {
  useBrowserOccluder(true);
  return <KitContextMenu x={position.x} y={position.y} items={items as FrameMenuEntry[]} onClose={onClose} />;
}

/** Browser never opens the feature's layout launcher, but the port asks for a modal; a plain one. */
function BrowserModal({ open, onClose, title, children, testId }: BrowserModalProps) {
  useBrowserDismiss(open, onClose, { layer: 'dialog' });
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-dialog flex items-center justify-center bg-black/50" data-testid={testId}>
      <div role="dialog" aria-label={title} className="max-h-[80vh] w-[min(36rem,90vw)] overflow-auto rounded-lg border border-border bg-background p-4 shadow-2xl">
        {title ? <h2 className="mb-3 text-sm font-medium">{title}</h2> : null}
        {children}
      </div>
    </div>
  );
}

function BrowserMark({ className }: { className?: string }) {
  return <PiGlobeFill aria-hidden className={`${className ?? ''} text-[var(--browser-accent)]`} />;
}

function BrowserWordmark({ className }: { className?: string }) {
  return <span className={className}>Midnite Browser</span>;
}

const noRepos = () => ({ data: [] });

export const BROWSER_APP_HOST: BrowserHost = {
  ui: useBrowserAppUi,
  standalone: true,
  useRepos: noRepos,
  useRemotes: noRepos,
  Modal: BrowserModal,
  Tooltip: BrowserTooltip,
  ContextMenu: BrowserContextMenu,
  useDismiss: useBrowserDismiss,
  useOccluder: useBrowserOccluder,
  usePopoutHeaderLeading: () => null,
  usePopoutHeaderActions: () => null,
  MidniteIcon: BrowserMark,
  BrandMark: BrowserMark,
  Wordmark: BrowserWordmark,
  ClaudeIcon: SiClaude,
  appIcon: { spotify: SiSpotify, 'google-calendar': SiGooglecalendar, youtube: SiYoutube },
};
