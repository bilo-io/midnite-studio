import { z } from 'zod';

/**
 * `ViewId`/`VIEW_IDS` and `SettingsPageId`/`SETTINGS_PAGE_IDS` — the app's
 * navigable ids, moved here from `packages/app/src/store/ui-store.ts` (Phase
 * 81 Theme A, Decision 3). Declared array-first with `as const` — rather than
 * a hand-written union type plus a separately-annotated array, as `ui-store.ts`
 * had it — so each is a literal tuple a closed `z.enum` can be built over: the
 * companion's grammar reads them for its navigation verbs, and Theme F's
 * `ui.navigate` MCP tool exposes them to `tools/list` as the exact legal
 * values, not `string`. It is also what makes
 * `PAGE_WINDOW_ROLES satisfies readonly ViewId[]` (`window.ts`) a checked fact
 * rather than a comment.
 *
 * **Ids only.** Labels and keywords are UI copy and stay in `app` —
 * `VIEW_LABELS`/`VIEW_KEYWORDS` in `services/palette/providers.ts`, and the
 * `label`/`group` fields on `SETTINGS_PAGES` in `ui-store.ts`. `ui-store.ts`
 * re-exports both types and both arrays so no existing import path moves.
 */

/**
 * Every view, in rail order — the domain of the per-view maps below, and
 * `ViewId`'s definition.
 *
 * Seven since Phase 19, and the rail is now the app's table of contents rather
 * than three ways to look at one checkout. `dashboard` is deliberately second
 * (right after `landing`), `notes` third (Phase 86 Theme E) and `knowledge`
 * fourth (Phase 87 Theme C): all three render through `NavConfig.pinned`,
 * ABOVE the workspace section and without a header of their own, so their
 * position in this array is the only place that ordering is written down.
 * `landing` is first for a different reason — it is the only view whose path
 * is `/` rather than `/<id>`, the app's front door rather than an entry in
 * the rail. Nothing in `app.tsx`'s nav item lists names it, so it never
 * renders a rail row; it is reached from the brand mark, the title bar
 * wordmark and the palette.
 */
export const VIEW_IDS = [
  'landing',
  'dashboard',
  'notes',
  'knowledge',
  'files',
  'search',
  'optimizer',
  'tests',
  'database',
  'projects',
  'graph',
  'changes',
  'actions',
  'reviews',
  'issues',
  'history',
  'councils',
  'workflows',
  'video',
  'sessions',
  'apiClient',
  'settings',
] as const;
export type ViewId = (typeof VIEW_IDS)[number];

/**
 * Every settings page id, in no particular order (`SETTINGS_PAGES` in
 * `ui-store.ts` owns render/tab order, plus each page's label and group —
 * UI copy that stays in `app`). The Settings view splits into these (Phase
 * 16): an inner sidebar, not nav-rail sub-items — the rail stays view
 * navigation, and settings pages are one view's internal structure.
 */
export const SETTINGS_PAGE_IDS = [
  'appearance',
  'activity',
  'privacy',
  'graph',
  'diff',
  'sidebar',
  'search',
  'screenLock',
  'terminal',
  'agent',
  'reviews',
  'projects',
  'workflows',
  'video',
  'gitSafety',
  'trashSafety',
  'apiClient',
  'monitor',
  'browser',
  'cli',
  'updates',
  'health',
  'optimizer',
  'mcp',
  'companion',
  'apps',
  'accounts',
] as const;
export type SettingsPageId = (typeof SETTINGS_PAGE_IDS)[number];

/**
 * Settings ▸ Sidebar's sidenav visibility map — sparse, same semantics as
 * `NavVisibility` in `app`: absent/`true` = shown, `false` = hidden.
 */
export type NavVisibility = Partial<Record<ViewId, boolean>>;

/** Drop unknown view ids and non-booleans from a persisted blob. */
export function parseNavVisibility(raw: unknown): NavVisibility {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  const out: NavVisibility = {};
  for (const view of VIEW_IDS) {
    if (record[view] === false) out[view] = false;
  }
  return out;
}

/** Runtime validator for IPC or other wire paths that carry the map whole. */
export const NavVisibilitySchema = z.custom<NavVisibility>(
  (value) => parseNavVisibility(value) !== undefined,
  'navVisibility must be a record of view ids to booleans',
);
