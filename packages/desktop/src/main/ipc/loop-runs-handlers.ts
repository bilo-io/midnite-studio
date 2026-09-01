import { CHANNELS, failure, ok, schemas } from '@midnite/studio-shared';

import { listLoopRuns, startLoopRun, stopLoopRun } from '../loop-runs';
import { handle, handleBare } from './handle';

/**
 * FAB loop-run ledger (Phase 35). Start is announced by the renderer; the end
 * of a run belongs to main (`loop-runs.ts` is wired to the pty's own exit), so
 * these three verbs are all the renderer ever needs.
 */
export function registerLoopRunsHandlers(): void {
  handleBare(CHANNELS.loopRunsList, async () => ({ runs: await listLoopRuns() }));

  handle(
    CHANNELS.loopRunsStart,
    schemas.LoopRunStartRequest,
    async (req) => ok(await startLoopRun(req)),
    (issue) => failure(issue),
  );

  handle(
    CHANNELS.loopRunsStop,
    schemas.LoopRunStopRequest,
    async ({ sessionId }) => {
      await stopLoopRun(sessionId);
      return ok();
    },
    (issue) => failure(issue),
  );
}
