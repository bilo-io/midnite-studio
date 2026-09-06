import { normalizeExternalUrl } from '@midnite/studio-shared';

import { useBrowserStore } from '../store/browser-store';
import { useUiStore, type LinkTarget } from '../store/ui-store';

import { openExternal } from './queries';

export type { LinkTarget };

/**
 * The one place in the renderer that decides where a link opens (Phase 71
 * Theme A).
 *
 * Before this, twenty-five call sites called `openExternal` directly and every
 * link in the app left for Safari — including a PR you were reviewing, a
 * workflow run you were watching and a preview deployment a check had just
 * posted, all while an embedded browser sat behind them. This function is what
 * those call sites move onto; the decision itself stays renderer state, so it
 * needs no new IPC channel.
 *
 * `openExternal` is NOT replaced. It remains the only path to the system
 * browser, and this module delegates to it for `mailto:` (and anything else
 * off `OPEN_EXTERNAL_PROTOCOLS`) as well as for a deliberate hand-off. The
 * protocol allowlist in `shared/src/ipc/schemas.ts` is read here, never
 * widened.
 *
 * Store access is via `getState()` rather than hooks on purpose: half the
 * callers are not components. `terminal-links.ts` takes a bare
 * `(url: string) => void` callback, `use-command-handlers.ts` builds plain
 * closures, and a hook would exclude both.
 */

export type OpenInMidniteOptions = {
  /**
   * The repo this link came from. Feeds `browser-store`'s derived
   * `repo:<id>` groups — open three PRs from three repos and the tab strip
   * groups them without being asked. Declared and tested since Phase 32
   * Theme D, and never passed by a production caller until this phase.
   */
  originRepoId?: string;
  /**
   * Force a destination, ignoring the stored preference. Omit to honour it.
   * `'in-app'` is used by the two links whose entire point is the embedded
   * pane (a Remotion studio on localhost, a preview deployment beside the
   * diff that produced it).
   */
  target?: LinkTarget;
  /**
   * Open the tab without focusing it, and without revealing the pane —
   * middle-click's gesture. See the note in {@link openInMidnite}.
   */
  background?: boolean;
};

/**
 * Open `url` in the embedded browser or the system one.
 *
 * Two outcomes, one function, so no caller ever has to branch: a URL whose
 * protocol is not `http:`/`https:` goes to `openExternal` even when the caller
 * asked for `'in-app'`. Routing a `mailto:` into a tab would not reach an email
 * client — Phase 32 Theme B blocks every other protocol at `will-navigate`, so
 * it would produce a blocked-navigation error page instead.
 */
export function openInMidnite(url: string, options: OpenInMidniteOptions = {}): void {
  const { originRepoId, target, background = false } = options;
  const preference = target ?? useUiStore.getState().linkTarget;

  // The canonical href, not the caller's string: the WHATWG parser strips
  // leading whitespace and control characters, so what we hand the engine is
  // what was actually validated. `null` means "not http(s)" — including
  // `mailto:`, which `openExternal` is still the right home for.
  const inAppUrl = normalizeExternalUrl(url);
  const httpLike = inAppUrl !== null && !inAppUrl.startsWith('mailto:');

  if (preference === 'system' || !httpLike) {
    openExternal(url);
    return;
  }

  const { activeTabId: previous, openTab, activateTab } = useBrowserStore.getState();

  /*
    A background tab deliberately does NOT reveal the pane. Middle-click means
    "keep me where I am", and opening the browser over the view being read
    contradicts the gesture — the tab is there when `Mod+B` is next pressed.
    (Phase 71's open question of the same name, resolved this way.)
  */
  if (!background) useUiStore.getState().setBrowserOpen(true);

  const tabId = openTab(inAppUrl, originRepoId);

  /*
    `openTab` already sets `activeTabId` itself, so the foreground case is a
    no-op restatement and the background case is the real work: put the
    selection back where it was. Stated explicitly in both directions rather
    than relying on `openTab`'s side effect, because the contract this function
    owns is "focused unless `background`" and it should survive `openTab`
    changing its mind. With no previous tab there is nothing to return to, and
    the new one keeps the focus it was given.
  */
  if (background && previous) activateTab(previous);
  else activateTab(tabId);
}

/** The shape of a mouse event this module reads — a plain object, so a test needs no DOM. */
export type LinkModifiers = {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  /** `MouseEvent.button`: 0 primary, 1 middle, 2 secondary. */
  button: number;
};

/**
 * Resolve a click's modifiers against the stored preference.
 *
 * Pure and exported rather than inline in a handler: every routed call site
 * depends on it, it is the only piece of this theme with a combinatorial input
 * space, and a rule buried in one `onClick` is a rule the next call site
 * reimplements slightly differently.
 *
 * Precedence, highest first:
 *
 * 1. `shiftKey` → always the system browser, foreground. "Leave the app" has
 *    to be one unambiguous gesture, so Shift beats Cmd deliberately — a user
 *    holding both is asking for the stronger of the two.
 * 2. `button === 1` (middle) → the preference, in the background. Middle-click
 *    is "open it, don't take me there", which is orthogonal to *where*.
 * 3. `metaKey || ctrlKey` → the OPPOSITE of the preference, foreground. One
 *    modifier, one escape hatch, in whichever direction the user has not
 *    already chosen.
 * 4. Otherwise → the preference, foreground.
 */
export function resolveLinkTarget(
  event: LinkModifiers,
  preference: LinkTarget,
): { target: LinkTarget; background: boolean } {
  if (event.shiftKey) return { target: 'system', background: false };
  if (event.button === 1) return { target: preference, background: true };
  if (event.metaKey || event.ctrlKey) {
    return { target: preference === 'in-app' ? 'system' : 'in-app', background: false };
  }
  return { target: preference, background: false };
}

/**
 * The click handler's whole job, for a call site that has an event and a URL.
 *
 * Reads the preference once, resolves the modifiers against it and opens —
 * so a call site is one line and cannot get the precedence rules subtly wrong.
 */
export function openLinkFromEvent(
  url: string,
  event: LinkModifiers,
  options: { originRepoId?: string } = {},
): void {
  const { target, background } = resolveLinkTarget(event, useUiStore.getState().linkTarget);
  openInMidnite(url, { ...options, target, background });
}
