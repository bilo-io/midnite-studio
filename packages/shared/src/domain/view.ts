import { z } from 'zod';

import {
  composeFeatureIds,
  FEATURE_SETTINGS_PAGES,
  FEATURE_VIEWS,
  STUDIO_SETTINGS_PAGE_ORDER,
  STUDIO_VIEW_ORDER,
  type RegisteredSettingsPageId,
  type RegisteredViewId,
} from './feature-registrations';

/**
 * `ViewId`/`VIEW_IDS` and `SettingsPageId`/`SETTINGS_PAGE_IDS` — the app's
 * navigable ids, moved here from `packages/app/src/store/ui-store.ts` (Phase
 * 81 Theme A, Decision 3). Each is typed as a non-empty tuple of its
 * id union — rather than a hand-written union type plus a separately-annotated
 * array, as `ui-store.ts` had it — so a closed `z.enum` can be built over it: the
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
 * **Composed, not written out** (Phase 113 Theme C). Each feature registers
 * the views it owns in `feature-registrations.ts`, and Studio's rail order
 * (`STUDIO_VIEW_ORDER`) unions them into this list. The result is exactly the
 * 22-id literal this used to be, in the same order — `view.test.ts` pins it —
 * so no persisted or routed id moved. A new view is registered by its feature
 * and placed in `STUDIO_VIEW_ORDER`; it is never added here.
 *
 * The order is load-bearing in places that look incidental. `landing` is first
 * because it is the only view whose path is `/` rather than `/<id>` — the
 * app's front door rather than a rail row, reached from the brand mark, the
 * title bar wordmark and the palette. `dashboard` is second, `notes` third
 * (Phase 86 Theme E) and `knowledge` sixth (Phase 87 Theme C): those render
 * through `NavConfig.pinned`, ABOVE the workspace section and without a header
 * of their own, so this order is the only place that ordering is written down.
 * The palette also breaks keyword ties by first match in this order.
 * `tasks` absorbed the old `projects` and `issues` views (`ui-store.ts`'s v31
 * migration), and `media` replaced `video` (v29).
 */
export const VIEW_IDS = composeFeatureIds(FEATURE_VIEWS, STUDIO_VIEW_ORDER) as readonly RegisteredViewId[] as readonly [
  RegisteredViewId,
  ...RegisteredViewId[],
];
export type ViewId = RegisteredViewId;

/**
 * Every settings page id. `SETTINGS_PAGES` in `ui-store.ts` owns render/tab
 * order, plus each page's label and group — UI copy that stays in `app`. The
 * Settings view splits into these (Phase 16): an inner sidebar, not nav-rail
 * sub-items — the rail stays view navigation, and settings pages are one
 * view's internal structure.
 *
 * Composed the same way as `VIEW_IDS`, from each feature's registered pages in
 * `STUDIO_SETTINGS_PAGE_ORDER`, into the exact 28-id list it replaced (order
 * included — it is what `z.enum` publishes to MCP `tools/list`).
 */
export const SETTINGS_PAGE_IDS = composeFeatureIds(
  FEATURE_SETTINGS_PAGES,
  STUDIO_SETTINGS_PAGE_ORDER,
) as readonly RegisteredSettingsPageId[] as readonly [RegisteredSettingsPageId, ...RegisteredSettingsPageId[]];
export type SettingsPageId = RegisteredSettingsPageId;

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
  // `projects` was renamed `tasks` — a blob written before that (and not yet
  // through `ui-store.ts`'s v31 migration) keeps its hidden-Projects choice.
  if (record.tasks === undefined && record.projects === false) out.tasks = false;
  return out;
}

/** Runtime validator for IPC or other wire paths that carry the map whole. */
export const NavVisibilitySchema = z.custom<NavVisibility>(
  (value) => parseNavVisibility(value) !== undefined,
  'navVisibility must be a record of view ids to booleans',
);
