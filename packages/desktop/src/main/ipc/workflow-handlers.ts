import { CHANNELS, failure, ok, schemas } from '@midnite/studio-shared';

import { defaultLogger } from '../log';
import {
  cancelRun,
  decideGate,
  deleteWorkflow,
  getRun,
  listRunsForWorkflow,
  listWorkflows,
  resumeRun,
  runWorkflow,
  saveWorkflow,
  setWorkflowDefaults,
} from '../workflow-service';
import {
  deleteWorkflowTemplate,
  listWorkflowTemplates,
  saveWorkflowTemplate,
} from '../workflow-templates-store';
import { handle, handleBare, handleSend } from './handle';

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
    CHANNELS.workflowResume,
    schemas.WorkflowResumeRequest,
    async ({ runId }) => resumeRun(runId),
    (issue) => failure(issue),
  );

  handle(
    CHANNELS.workflowGateDecide,
    schemas.WorkflowGateDecideRequest,
    async ({ runId, nodeId, decision, note }) => decideGate(runId, nodeId, decision, note, 'panel'),
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

  handleBare(CHANNELS.workflowTemplatesList, async () => ({ templates: await listWorkflowTemplates() }));

  handle(
    CHANNELS.workflowTemplateSave,
    schemas.WorkflowTemplateSaveRequest,
    async ({ template }) => saveWorkflowTemplate(template),
    (issue) => failure(issue),
  );

  handle(
    CHANNELS.workflowTemplateDelete,
    schemas.WorkflowTemplateDeleteRequest,
    async ({ id }) => deleteWorkflowTemplate(id),
    (issue) => failure(issue),
  );

  handleSend(
    CHANNELS.workflowSetDefaults,
    schemas.WorkflowSetDefaultsRequest,
    (payload) => setWorkflowDefaults(payload),
    (issue) => defaultLogger.warn(issue),
  );
}
