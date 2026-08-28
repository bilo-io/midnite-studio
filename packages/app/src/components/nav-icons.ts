import type { IconType } from 'react-icons';
import { FaCodePullRequest } from 'react-icons/fa6';
import { GoBeaker } from 'react-icons/go';
import {
  LuActivity,
  LuBot,
  LuDiff,
  LuFolderTree,
  LuGitBranch,
  LuLayoutDashboard,
  LuPalette,
  LuPanelLeft,
  LuPlay,
  LuSearch,
  LuSettings,
  LuShieldCheck,
  LuSquareTerminal,
} from 'react-icons/lu';

import type { SettingsPageId, ViewId } from '../store/ui-store';

/**
 * One glyph per view, shared by the nav rail (`app.tsx`) and the title bar's
 * breadcrumbs.
 *
 * A separate module rather than a field on `NAV_ITEMS` or on `SETTINGS_PAGES`:
 * the rail's item list also carries ordering and the forge gating, the store is
 * a plain data module that should not pull an icon package in behind it, and
 * the breadcrumb needs only the glyph. Duplicating the map instead would let
 * the two surfaces drift — the same view wearing two different icons is worse
 * than either icon.
 */
export const VIEW_ICON: Record<ViewId, IconType> = {
  dashboard: LuLayoutDashboard,
  files: LuFolderTree,
  search: LuSearch,
  graph: LuGitBranch,
  changes: LuDiff,
  actions: LuPlay,
  // `GoBeaker` — Octicons, not Lucide. A second icon set here is the point of
  // `react-icons` (see CLAUDE.md): the beaker reads as "test suite" the way it
  // does on GitHub, and taking the nearest match within one family is the thing
  // the package exists to avoid.
  tests: GoBeaker,
  // `FaCodePullRequest` — react-icons' Font Awesome 6 set, a third family
  // beside Tests' `GoBeaker`. Neither Lucide nor Octicons has a pull-request
  // glyph that reads as one at rail size.
  reviews: FaCodePullRequest,
  settings: LuSettings,
};


/**
 * A glyph per settings page, mirroring midnite's settings sidebar — which is
 * what turns a list of seven words into something scannable at a glance. Shared
 * with the breadcrumb for the same reason as `VIEW_ICON`.
 */
export const SETTINGS_PAGE_ICON: Record<SettingsPageId, IconType> = {
  appearance: LuPalette,
  graph: LuGitBranch,
  sidebar: LuPanelLeft,
  terminal: LuSquareTerminal,
  agent: LuBot,
  // A shield rather than a git or comment glyph: this page is the permission in
  // front of the review actions, not the actions themselves.
  reviews: LuShieldCheck,
  monitor: LuActivity,
};
