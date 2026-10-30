import type { NavGroup } from '@midnite/studio-frame';
import { LuCode, LuDatabase, LuFlaskConical, LuGitBranch, LuGitPullRequest, LuListChecks, LuPlay, LuPlug, LuSquareTerminal } from 'react-icons/lu';

import { coderManifest, CODER_VIEWS, type CoderViewId } from '../manifest';

/** What each Coder view is called in the rail, and its glyph. */
export const CODER_NAV_VIEWS: Record<CoderViewId, { label: string; icon: NavGroup['icon'] }> = {
  reviews: { label: 'Reviews', icon: LuGitPullRequest },
  actions: { label: 'Actions', icon: LuPlay },
  tasks: { label: 'Tasks', icon: LuListChecks },
  tests: { label: 'Tests', icon: LuFlaskConical },
  graph: { label: 'Graph', icon: LuGitBranch },
  apiClient: { label: 'API', icon: LuPlug },
  database: { label: 'Database', icon: LuDatabase },
  sessions: { label: 'Sessions', icon: LuSquareTerminal },
};

/**
 * Coder's nav group in a host's rail (Phase 124 Theme E.3): its eight views as rows, in `CODER_VIEWS` order.
 * The module's accent shows on the group label only.
 */
export const CODER_NAV_GROUP: NavGroup = {
  id: 'coder',
  label: coderManifest.label,
  icon: LuCode,
  accent: coderManifest.accent,
  views: CODER_VIEWS.map((id) => ({ id, ...CODER_NAV_VIEWS[id] })),
};
