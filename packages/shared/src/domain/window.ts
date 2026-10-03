import { z } from 'zod';

import type { ViewId } from './view';

/**
 * The auxiliary *panels* a secondary `BrowserWindow` can host — the surfaces
 * that **move** when detached: the docked slot collapses and the popout
 * becomes the only copy of that panel.
 *
 * The three `apps-*` roles (Phase 83) are one literal per third-party app
 * rather than a single shared `apps` role — see `domain/apps.ts`'s
 * `AppIdSchema`. That is what lets Spotify and Calendar each become their own
 * independent floating window at the same time (Theme D): `windowForRole`
 * already enforces at most one window per role, so one role per app makes
 * "one popout per app, any subset open at once" fall out for free instead of
 * needing new multi-instance-per-role plumbing.
 */
export const PANEL_WINDOW_ROLES = [
  'terminal',
  'repos',
  'fab',
  'companion',
  'browser',
  'apps-spotify',
  'apps-google-calendar',
  'apps-youtube',
] as const;

/**
 * The *pages* a secondary `BrowserWindow` can host, named by the `ViewId`
 * they render (`app`'s `VIEW_COMPONENT`).
 *
 * Pages **duplicate** rather than move: the main window goes on rendering the
 * view, and the popout mounts a second instance of the same component. So a
 * page role has no `*Detached` flag collapsing anything, no placeholder, and
 * "dock" is just "close the window" — there is nothing to move back.
 *
 * A role per page, rather than one `page` role carrying a `ViewId` payload,
 * because `windowForRole` already enforces at most one window per role — which
 * *is* the one-detached-instance-per-page rule, for free. It is also what
 * bounds the cost of duplicate rendering: each of these fetches its own data in
 * its own renderer process, and a second copy is affordable where an unbounded
 * number would not be.
 */
export const PAGE_WINDOW_ROLES = [
  'graph',
  'actions',
  'files',
  'database',
  'dashboard',
  'search',
  'tests',
  'tasks',
  'reviews',
  'history',
  'optimizer',
  'sessions',
  'chats',
  'councils',
  'workflows',
  'media',
  'models',
] as const satisfies readonly ViewId[];

/*
  `settings` and `landing` are deliberately absent: surfaces nobody wants
  twice, a preferences pane and the app's front door.

  `councils`, `workflows`, `media` and `models` (the whole Agents rail
  section) were once excluded as long-running and mount-heavy. Audited: none
  seeds state or drives a reveal on mount the way `BrowserPane` does; each
  fetches over IPC into its own QueryClient, and the only cross-window bits
  (workflow reveal, councils history) are per-renderer stores that degrade to
  a fresh view in the popout.
*/


/**
 * Which auxiliary surface a secondary `BrowserWindow` hosts, or `main` for the
 * primary window. A popout's own renderer learns its role via `WINDOW_ROLE_ARG`
 * (see `ipc/channels.ts`) rather than a URL query string.
 */
export const WindowRoleSchema = z.enum(['main', ...PANEL_WINDOW_ROLES, ...PAGE_WINDOW_ROLES]);
export type WindowRole = z.infer<typeof WindowRoleSchema>;

/** A panel role — detaching MOVES it out of the main window. */
export type PanelWindowRole = (typeof PANEL_WINDOW_ROLES)[number];

/** A page role — detaching DUPLICATES it into a second window. */
export type PageWindowRole = (typeof PAGE_WINDOW_ROLES)[number];

const PAGE_ROLE_SET: ReadonlySet<string> = new Set(PAGE_WINDOW_ROLES);

/**
 * Splits the two detach semantics apart at every seam that has to branch on
 * them — `window-manager`'s sizing table, `use-window-sync`'s flag
 * reconciliation, `DetachedRoot`'s render.
 */
export function isPageWindowRole(role: WindowRole): role is PageWindowRole {
  return PAGE_ROLE_SET.has(role);
}

/** One open window, as the renderer needs to know it. */
export const WindowDescriptorSchema = z.object({
  /** Electron's `BrowserWindow.id`. */
  id: z.number().int(),
  role: WindowRoleSchema,
  repoId: z.string().nullable(),
});
export type WindowDescriptor = z.infer<typeof WindowDescriptorSchema>;
