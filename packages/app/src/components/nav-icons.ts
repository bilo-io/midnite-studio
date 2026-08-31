import type { IconType } from 'react-icons';
import { FaCodePullRequest } from 'react-icons/fa6';
import { GoBeaker, GoGlobe } from 'react-icons/go';
import { IoIosGitNetwork } from 'react-icons/io';
import {
  LuActivity,
  LuBot,
  LuDiff,
  LuDownload,
  LuFolderTree,
  LuHistory,
  LuLayoutDashboard,
  LuLock,
  LuPalette,
  LuPanelLeft,
  LuPlay,
  LuSearch,
  LuSettings,
  LuShieldCheck,
  LuSquareTerminal,
  LuStethoscope,
  LuTerminal,
  LuUsers,
  LuWorkflow,
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
  tests: GoBeaker,
  graph: IoIosGitNetwork,
  changes: LuDiff,
  actions: LuPlay,
  reviews: FaCodePullRequest,
  councils: LuUsers,
  workflows: LuWorkflow,
  sessions: LuHistory,
  settings: LuSettings,
};


/**
 * A glyph per settings page, mirroring midnite's settings sidebar — which is
 * what turns a list of seven words into something scannable at a glance. Shared
 * with the breadcrumb for the same reason as `VIEW_ICON`.
 */
export const SETTINGS_PAGE_ICON: Record<SettingsPageId, IconType> = {
  appearance: LuPalette,
  graph: IoIosGitNetwork,
  sidebar: LuPanelLeft,
  search: LuSearch,
  screenLock: LuLock,
  terminal: LuSquareTerminal,
  agent: LuBot,
  // A shield rather than a git or comment glyph: this page is the permission in
  // front of the review actions, not the actions themselves.
  reviews: LuShieldCheck,
  monitor: LuActivity,
  browser: GoGlobe,
  cli: LuTerminal,
  updates: LuDownload,
  health: LuStethoscope,
};
