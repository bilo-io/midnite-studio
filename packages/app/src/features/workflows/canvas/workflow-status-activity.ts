import type { ActivityStatus, WorkflowNodeStatus } from '@midnite/studio-shared';

/**
 * A node run's six-state lifecycle, mapped onto the shared
 * {@link ActivityStatus} vocabulary (Phase 95 Theme A) — extracted from
 * `run-node-detail.tsx` (Phase 95 Theme I) so the new canvas node view
 * (`workflow-node-view.tsx`) reads the identical mapping rather than
 * restating it: a node's glow on the canvas and its status text in the
 * detail panel must never disagree about what `timeout` or `skipped` means.
 *
 * `timeout` reads as `failed` (both are terminal-bad). `skipped` stays
 * `queued` rather than `idle`: `idle`'s own colour is `transparent` (the "no
 * ring at all" rule for a card with nothing to show), which would render a
 * skipped node invisible — `queued`'s muted grey is what `pending`/`skipped`
 * both wore before this map existed.
 */
export const WORKFLOW_STATUS_TO_ACTIVITY: Record<WorkflowNodeStatus, ActivityStatus> = {
  pending: 'queued',
  running: 'running',
  succeeded: 'done',
  failed: 'failed',
  timeout: 'failed',
  skipped: 'queued',
};
