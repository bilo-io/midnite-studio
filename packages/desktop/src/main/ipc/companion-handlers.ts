import { CHANNELS, emptyCompanionSnapshot, schemas } from '@midnite/studio-shared';
import type { CompanionDigest, CompanionSnapshot } from '@midnite/studio-shared';

import { buildCompanionDigest } from '../companion/digest';
import { buildCompanionSnapshot } from '../companion/snapshot';
import { handle } from './handle';

/**
 * The companion's two grounding channels (Phase 79 Theme B).
 *
 * Both are read-only, both compose the Phase 57 MCP tools in-process, and
 * both **always resolve** — `handle` answers a validation failure with a value
 * rather than a rejection (`handle.ts`), and the fallback for each is the
 * "nothing to say" shape rather than an error the renderer has to branch on.
 * An empty snapshot is a state the script already handles (no repo open); a
 * companion that threw would be a greeting that never arrives.
 *
 * `mcp-handlers.ts` is the crib for the file's shape — forward to the module
 * that does the work, register nothing else here.
 */
export function registerCompanionHandlers(): void {
  handle<typeof schemas.CompanionSnapshotRequest, CompanionSnapshot>(
    CHANNELS.companionSnapshot,
    schemas.CompanionSnapshotRequest,
    (req) => buildCompanionSnapshot(req),
    () => emptyCompanionSnapshot(),
  );

  handle<typeof schemas.CompanionDigestRequest, CompanionDigest>(
    CHANNELS.companionDigest,
    schemas.CompanionDigestRequest,
    (req) => buildCompanionDigest(req),
    // A window with nothing in it, dated now: `summariseDigest` turns that
    // into "nothing has landed", which is the truthful answer to a request
    // this process could not read.
    () => ({ landed: [], inProgress: [], since: Date.now() }),
  );
}
