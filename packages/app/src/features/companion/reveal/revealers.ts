import type { RevealerTable } from './types';
import { AGENT_REVEALERS } from './revealers/agent';
import { GIT_REVEALERS } from './revealers/git';
import { NOTES_MEDIA_REVEALERS } from './revealers/notes-media';
import { TOOLS_REVEALERS } from './revealers/tools';

/**
 * Phase 112 Theme B — the total revealer table, assembled from one slice per
 * family. Each later theme edits only its own `revealers/<family>.ts`; this
 * file never changes. The annotation is what makes it total: a kind added to
 * `ResourceRefSchema` with no entry in any slice fails typecheck here.
 */
export const REVEALERS: RevealerTable = {
  ...GIT_REVEALERS,
  ...AGENT_REVEALERS,
  ...NOTES_MEDIA_REVEALERS,
  ...TOOLS_REVEALERS,
};
