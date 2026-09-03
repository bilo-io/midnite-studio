import { CHANNELS, failure, ok, schemas } from '@midnite/studio-shared';
import { ipcMain } from 'electron';

import {
  cancelRun,
  deleteWorkflow,
  getRun,
  listRunsForWorkflow,
  listWorkflows,
  runWorkflow,
  saveWorkflow,
  setWorkflowDefaults,
} from '../workflow-service';
import { handle, handleBare } from './handle';

/**
 * Workflows (Phase 43) — global CRUD plus the run lifecycle.
 *
 * There is no per-run output channel: a run's progress is the bare
 * `workflowRunChanged` event `workflow-service.ts` emits, which the renderer
 * answers by re-fetching the one run it is looking at. See `channels.ts` for
 * why that is a ping rather than a payload.
 */
export function registerWorkflowHandlers(): void {
  handleBare(CHANNELS.workflowList, async () => ({ workflows: await listWorkflows() }));

  handle(
    CHANNELS.workflowSave,
    schemas.WorkflowSaveRequest,
    async ({ workflow }) => ok(await saveWorkflow(workflow)),
    (issue) => failure(issue),
  );

  handle(
    CHANNELS.workflowDelete,
    schemas.WorkflowDeleteRequest,
    async ({ id }) => deleteWorkflow(id),
    (issue) => failure(issue),
  );

  handle(
    CHANNELS.workflowRun,
    schemas.WorkflowRunRequest,
    async ({ workflowId }) => runWorkflow(workflowId),
    (issue) => failure(issue),
  );

  handle(
    CHANNELS.workflowCancel,
    schemas.WorkflowCancelRequest,
    async ({ runId }) => cancelRun(runId),
    (issue) => failure(issue),
  );

  handle(
    CHANNELS.workflowRunsList,
    schemas.WorkflowRunsListRequest,
    async ({ workflowId }) => ({ runs: await listRunsForWorkflow(workflowId) }),
    () => ({ runs: [] }),
  );

  handle(
    CHANNELS.workflowRunsGet,
    schemas.WorkflowRunsGetRequest,
    async ({ runId }) => ({ run: await getRun(runId) }),
    () => ({ run: null }),
  );

  // One-way, like `update.setChannel` (update-service.ts) — ipcMain.on with a
  // manual safeParse, not `handle`'s invoke/response shape. The Settings page
  // has nothing to await; a malformed payload is silently ignored rather than
  // surfaced, matching that precedent.
  ipcMain.on(CHANNELS.workflowSetDefaults, (_event, req) => {
    const parsed = schemas.WorkflowSetDefaultsRequest.safeParse(req);
    if (!parsed.success) return;
    setWorkflowDefaults(parsed.data);
  });
}
