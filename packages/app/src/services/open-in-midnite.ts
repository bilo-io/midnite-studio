import { normalizeExternalUrl } from '@midnite/studio-shared';

import { useActionsStore } from '../store/actions-store';
import { useBrowserStore } from '../store/browser-store';
import { useIssuesStore } from '../store/issues-store';
import { useReviewsStore } from '../store/reviews-store';
import { useUiStore, type LinkTarget } from '../store/ui-store';

import { resolveInAppRoute, type InAppRoute } from './link-route-resolver';
import { openExternal } from './queries';

export type { LinkTarget };
export type { InAppRoute } from './link-route-resolver';

/**
 * The one place in the renderer that decides where a link opens (Phase 71
 * Theme A; the ad hoc click-modifier unification built on top of it).
 *
 * Before Phase 71, twenty-five call sites called `openExternal` directly and
 * every link in the app left for Safari — including a PR you were reviewing,
 * a workflow run you were watching and a preview deployment a check had just
 * posted, all while an embedded browser sat behind them. Before this theme, a
 * click's only two possible destinations were that embedded browser and the
 * system one; this theme adds a third — the app's own native view for
 * whatever the link points at — and a fixed modifier grammar that reaches it:
 *
 * - **Mod+Shift (Cmd+Shift/Ctrl+Shift)** → *into* the app, deliberately: the
 *   native view {@link resolveInAppRoute} has for the link if it has one,
 *   else the embedded browser — never the system one, and never the stored
 *   preference. Tried even where `preferInAppRoute` is off, because the
 *   gesture is an explicit ask that outranks an "Open on GitHub" label. It is
 *   Mod+Shift rather than Alt because the terminal already spends Alt+click
 *   on moving the shell cursor (xterm's `altClickMovesCursor`), and the one
 *   "open it here" gesture has to mean the same thing in the terminal as
 *   everywhere else.
 * - **Mod (Cmd/Ctrl) or Shift** on its own → the system browser. Two
 *   spellings of "leave the app" on purpose: Shift predates this theme and
 *   Settings ▸ Browser still documents it, so it stays a synonym rather than
 *   a removed escape hatch.
 * - **Alt/Option** → the embedded browser, unconditionally — even for a URL
 *   {@link resolveInAppRoute} would otherwise send to a native view. This is
 *   the one deliberate way to see the forge's own page for something Midnite
 *   also has an opinion about.
 * - **Plain click** → {@link resolveInAppRoute} first: a PR link becomes
 *   `PrDetail`, an issue link becomes `IssueDetail`, and so on for whatever
 *   `link-route-resolver.ts`'s table covers. Only when nothing matches — an
 *   unregistered repo, an unrecognised path, a non-forge URL entirely — does
 *   it fall to the embedded-vs-system preference below.
 * - **Middle-click** → unchanged from Phase 71: the preference, in the
 *   background, never a native-view navigation (swapping the *whole app's*
 *   view out from under a background gesture would defeat the point of it).
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
   * Force a destination, ignoring modifiers AND {@link resolveInAppRoute}.
   * `'in-app'` is used by the two links whose entire point is the embedded
   * pane (a Remotion studio on localhost, a preview deployment beside the
   * diff that produced it) — a call site that already knows exactly where a
   * link belongs, and would be wrong to second-guess with a route lookup.
   */
  target?: LinkTarget;
  /**
   * Open the tab without focusing it, and without revealing the pane —
   * middle-click's gesture. See the note in {@link openInMidnite}.
   */
  background?: boolean;
  /**
   * Try {@link resolveInAppRoute} before falling back to the stored
   * embedded/system preference (default `false`).
   *
   * Off by default because most `openInMidnite`/`openLinkFromEvent` call
   * sites are an explicit "Open \#42 on GitHub" button or an "Open … on
   * GitHub" context-menu row — the label is a promise to leave for the
   * forge, and honouring it verbatim (rather than silently re-navigating to
   * the native view the reader is arguably already looking at) is the
   * correct behaviour there. It is turned on at the handful of call sites
   * that render an opportunistic link with no such promise attached:
   * rendered markdown (`ExternalLink`), terminal output
   * (`terminal-view.tsx`), and the sidebar/dashboard rows whose whole job
   * *is* "open the native view for this thing" (`IssuesSection`,
   * `forge-widgets.tsx`).
   */
  preferInAppRoute?: boolean;
};

/**
 * Open `url` in the embedded browser, the system one, or the app's own
 * native view for it.
 *
 * A URL whose protocol is not `http:`/`https:` always goes to `openExternal`,
 * regardless of `target`, modifiers or `preferInAppRoute`: routing a
 * `mailto:` into a tab would not reach an email client — Phase 32 Theme B
 * blocks every other protocol at `will-navigate`, so it would produce a
 * blocked-navigation error page instead — and it plainly cannot resolve to an
 * in-app route either.
 */
export function openInMidnite(url: string, options: OpenInMidniteOptions = {}): void {
  const { originRepoId, target, background = false, preferInAppRoute = false } = options;

  if (target !== undefined) {
    dispatch(url, target === 'system' ? { kind: 'system' } : { kind: 'embedded' }, {
      originRepoId,
      background,
    });
    return;
  }

  const destination = resolveDestination(url, NO_MODIFIERS, {
    preference: useUiStore.getState().linkTarget,
    preferInAppRoute,
  });
  dispatch(url, destination, { originRepoId, background });
}

/** The shape of a mouse event this module reads — a plain object, so a test needs no DOM. */
export type LinkModifiers = {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  /** `MouseEvent.button`: 0 primary, 1 middle, 2 secondary. */
  button: number;
};

const NO_MODIFIERS: LinkModifiers = {
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  button: 0,
};

type Destination =
  | { kind: 'system' }
  | { kind: 'embedded' }
  | { kind: 'in-app-route'; route: InAppRoute };

/**
 * Resolve a click's modifiers (and, for a plain click, the URL itself) to a
 * destination.
 *
 * Pure and exported rather than inline in a handler: every routed call site
 * depends on it, it is the only piece of this theme with a combinatorial
 * input space, and a rule buried in one `onClick` is a rule the next call
 * site reimplements slightly differently.
 *
 * Precedence, highest first:
 *
 * 1. `(metaKey || ctrlKey) && shiftKey` → {@link resolveInAppRoute} if it
 *    matches, else the embedded browser — whatever `preferInAppRoute` and the
 *    preference say. "Open it here" is as explicit as "leave the app".
 * 2. `shiftKey || metaKey || ctrlKey` → the system browser. Every other
 *    combination of these three is "leave the app", so they beat the rest.
 * 3. `altKey` → the embedded browser, unconditionally — bypasses
 *    {@link resolveInAppRoute} on purpose (see {@link OpenInMidniteOptions}).
 * 4. `button === 1` (middle) → the stored preference, in the background.
 *    Never a route: see the module docblock.
 * 5. Otherwise (a plain click) → {@link resolveInAppRoute} when
 *    `preferInAppRoute` is set and it matches; else the stored preference.
 */
export function resolveDestination(
  url: string,
  event: LinkModifiers,
  options: { preference: LinkTarget; preferInAppRoute: boolean },
): Destination {
  if ((event.metaKey || event.ctrlKey) && event.shiftKey) {
    const route = resolveInAppRoute(url);
    return route ? { kind: 'in-app-route', route } : { kind: 'embedded' };
  }
  if (event.shiftKey || event.metaKey || event.ctrlKey) return { kind: 'system' };
  if (event.altKey) return { kind: 'embedded' };
  if (event.button === 1) return preferenceDestination(options.preference);

  if (options.preferInAppRoute) {
    const route = resolveInAppRoute(url);
    if (route) return { kind: 'in-app-route', route };
  }
  return preferenceDestination(options.preference);
}

function preferenceDestination(preference: LinkTarget): Destination {
  return preference === 'system' ? { kind: 'system' } : { kind: 'embedded' };
}

/** Switch the app to the view {@link InAppRoute} names, selecting the repo/PR/issue/run it carries. */
export function navigateInAppRoute(route: InAppRoute): void {
  useUiStore.getState().selectRepo(route.repoId);
  switch (route.view) {
    case 'reviews':
      useReviewsStore.getState().selectPull(route.repoId, route.pull);
      break;
    case 'issues':
      useIssuesStore.getState().selectIssue(route.repoId, route.issue);
      break;
    case 'actions':
      useActionsStore.getState().selectRun(route.repoId, route.runId);
      break;
    case 'graph':
      break;
  }
  useUiStore.getState().setActiveView(route.view);
}

function dispatch(
  url: string,
  destination: Destination,
  { originRepoId, background }: { originRepoId?: string; background: boolean },
): void {
  if (destination.kind === 'in-app-route') {
    navigateInAppRoute(destination.route);
    return;
  }

  // The canonical href, not the caller's string: the WHATWG parser strips
  // leading whitespace and control characters, so what we hand the engine is
  // what was actually validated. `null` means "not http(s)" — including
  // `mailto:`, which `openExternal` is still the right home for.
  const inAppUrl = normalizeExternalUrl(url);
  const httpLike = inAppUrl !== null && !inAppUrl.startsWith('mailto:');

  if (destination.kind === 'system' || !httpLike) {
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

/**
 * The click handler's whole job, for a call site that has an event and a URL.
 *
 * Reads the preference once, resolves the modifiers (and, for a plain click,
 * the URL) against it and opens — so a call site is one line and cannot get
 * the precedence rules subtly wrong.
 */
export function openLinkFromEvent(
  url: string,
  event: LinkModifiers,
  options: { originRepoId?: string; preferInAppRoute?: boolean } = {},
): void {
  const destination = resolveDestination(url, event, {
    preference: useUiStore.getState().linkTarget,
    preferInAppRoute: options.preferInAppRoute ?? false,
  });
  dispatch(url, destination, {
    originRepoId: options.originRepoId,
    background: event.button === 1,
  });
}
