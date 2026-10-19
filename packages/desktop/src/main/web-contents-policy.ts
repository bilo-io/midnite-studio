/**
 * One global navigation net (Phase 91 Theme E).
 *
 * `app.on('web-contents-created')` fires for every WebContents in the process, so navigation
 * policy no longer depends on each construction site remembering to install it — which is how
 * `window.ts` and `window-manager.ts` (the two windows that carry the full preload bridge) came
 * to be the ones that needed it most.
 *
 * Scope: only contents whose `getType()` is `'window'`, i.e. a `BrowserWindow`'s own page. The
 * browser pane's tabs and the web-app views are `WebContentsView`s (`'browserView'`) with their
 * own `checkNavigationUrl` policy in the browser feature, which inverts this rule (they *must*
 * navigate to arbitrary http(s)) — a net that denied them would break the browser.
 *
 * Rule: an app window may load only its own document origin; `http(s)`/`mailto` are handed to the
 * OS browser as the **parsed `href`** (never the raw string — see `normalizeExternalUrl`); every
 * other scheme (`file:` outside the app, `javascript:`, `data:`, …) is dropped.
 *
 * Pure of Electron so it tests under bare vitest, like `browser-security.ts`.
 */
import { normalizeExternalUrl } from '@midnite/studio-shared';

import { checkAppNavigationUrl } from './app-navigation';

export type PolicyEvent = { preventDefault(): void };

/** The slice of `WebContents` the policy touches. */
export type PolicyTarget = {
  getType(): string;
  on(event: 'will-navigate' | 'will-redirect', listener: (event: PolicyEvent, url: string) => void): unknown;
  setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' }): void;
};

export type OpenExternal = (href: string) => void;

/** Open `url` in the OS browser iff it parses to an allowed scheme; returns whether it did. */
export function openExternalChecked(url: string, openExternal: OpenExternal): boolean {
  const href = normalizeExternalUrl(url);
  if (href === null) return false;
  openExternal(href);
  return true;
}

/** Attach the policy to one WebContents. Returns false (and attaches nothing) for non-window contents. */
export function applyAppWebContentsPolicy(
  wc: PolicyTarget,
  devServerOrigin: string | null,
  openExternal: OpenExternal,
): boolean {
  if (wc.getType() !== 'window') return false;
  const guard = (event: PolicyEvent, url: string): void => {
    const decision = checkAppNavigationUrl(url, devServerOrigin);
    if (decision.allowed) return;
    event.preventDefault();
    if (decision.openExternal) openExternalChecked(url, openExternal);
  };
  wc.on('will-navigate', guard);
  wc.on('will-redirect', guard);
  // External links open in the user's browser, never in an app window with no chrome to escape from.
  wc.setWindowOpenHandler(({ url }) => {
    openExternalChecked(url, openExternal);
    return { action: 'deny' };
  });
  return true;
}
