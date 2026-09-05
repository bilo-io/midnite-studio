import { checksVerdict as sharedChecksVerdict } from '@midnite/studio-shared';
import type { ForgeRun } from '@midnite/studio-shared';

import type { ChecksVerdict } from './branch-health';

/**
 * The missing producer for `branchHealth`'s `checks` seam.
 *
 * `ChecksVerdict` has existed since Phase 13 with nothing supplying one — see
 * `todo/outstanding.md` → "Branch checks (the RAG dot's real source)", which
 * names exactly this: the last GitHub Actions conclusion for the branch's head
 * commit.
 *
 * The logic itself moved to `@midnite/studio-shared` in Phase 57 Decision 12:
 * it is pure (only `ForgeRun`, already a `shared` export), and `forge.checks`
 * — an MCP tool served from the main process, which may not import anything
 * under `packages/app` — needed the exact same mapping from "what CI said" to
 * a verdict. One implementation, re-exported here under this module's
 * existing name and this feature's own `ChecksVerdict` type (identical in
 * shape to shared's, so nothing downstream of this file changes) rather than
 * a second copy main and the renderer could quietly disagree on.
 */
export function checksVerdict(
  runs: readonly ForgeRun[] | undefined,
  headSha: string | null | undefined,
): ChecksVerdict | undefined {
  return sharedChecksVerdict(runs, headSha);
}
