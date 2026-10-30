import { navFromModules } from '@midnite/studio-frame';
import { APP_MODULES } from '@midnite/studio-shared';
import { AGENTS_NAV_GROUP } from '@midnite/studio-module-agents/renderer';
import { CODER_NAV_GROUP } from '@midnite/studio-module-coder/renderer';
import { CREATOR_NAV_GROUP } from '@midnite/studio-module-creator/renderer';

/**
 * The Agents host's rail (Phase 124 Theme E.3): one titled group per module in `APP_MODULES.agents` — Agents,
 * Coder, Creator — each module's views beneath its label.
 */
export const AGENTS_HOST_NAV = navFromModules(APP_MODULES.agents, {
  agents: AGENTS_NAV_GROUP,
  coder: CODER_NAV_GROUP,
  creator: CREATOR_NAV_GROUP,
});
