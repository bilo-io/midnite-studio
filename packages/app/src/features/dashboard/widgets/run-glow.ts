import type { ActivityStatus, ForgeRun } from '@midnite/studio-shared';

/**
 * Which activity-glow status a Recent Workflow Runs row wears.
 *
 * Paints through the shared `.activity-glow[data-activity-status]` vocabulary
 * (Phase 95 Theme A) rather than a colour map of its own, so a run row reads
 * in the same colours as every other "something is happening" surface.
 * `shimmer` is true only for a run that is actually executing — the one row
 * state that earns a sweep on top of its pulse.
 */
export interface RunGlow {
  status: Extract<ActivityStatus, 'running' | 'queued' | 'waiting' | 'done' | 'failed' | 'idle'>;
  shimmer: boolean;
}

export function runGlow(run: Pick<ForgeRun, 'status' | 'conclusion'>): RunGlow {
  switch (run.status) {
    case 'in_progress':
      return { status: 'running', shimmer: true };
    case 'queued':
    case 'requested':
    case 'pending':
      return { status: 'queued', shimmer: false };
    case 'waiting':
      return { status: 'waiting', shimmer: false };
    case 'completed':
      break;
  }
  switch (run.conclusion) {
    case 'success':
      return { status: 'done', shimmer: false };
    case 'failure':
    case 'startup_failure':
    case 'timed_out':
      return { status: 'failed', shimmer: false };
    case 'action_required':
      return { status: 'waiting', shimmer: false };
    default:
      // cancelled / skipped / neutral / stale / null: a non-event, held still.
      return { status: 'idle', shimmer: false };
  }
}
