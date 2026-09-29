import type { ForgePull, ForgeRun } from '@midnite/studio-shared';

import { useForgeRunDetail } from '../../services/queries';
import { RunDetail } from './run-detail';

/**
 * One run read in depth — its job/step tree fetched and handed to `RunDetail`.
 *
 * The single home for "a run, rendered", shared by the Actions page and the git
 * graph's CI run modal so the two cannot drift: the same accordions, the same
 * shimmer on a running step, the same status glow, the same log pane. It used to
 * live inline in `ActionsView`, which is why the modal would otherwise have had
 * to copy the fetch.
 *
 * `pollMs` re-reads the job tree while the run is still moving — the modal
 * passes one (gated on the window being on screen) so a running run's steps
 * advance in front of the reader. The Actions page passes none: refresh there
 * is explicit, for the rate-limit reason its own header gives.
 */
export function RunDetailPanel({
  repoId,
  run,
  pulls,
  pollMs = false,
}: {
  repoId: string;
  run: ForgeRun;
  pulls?: readonly ForgePull[] | null;
  pollMs?: number | false;
}) {
  const detail = useForgeRunDetail(repoId, run.id, true, run.status === 'completed' ? false : pollMs);
  return (
    <RunDetail
      repoId={repoId}
      run={run}
      jobs={detail.data?.detail?.jobs ?? []}
      loadingJobs={detail.isFetching}
      jobsError={detail.data?.error ?? null}
      pulls={pulls}
    />
  );
}
