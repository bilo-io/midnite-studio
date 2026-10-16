import { defineFeatureMain } from '@midnite/studio-runtime';
import { CHANNELS, failure, ok, schemas } from '@midnite/studio-shared';

import { workflowsManifest } from '../manifest';
import { demoApiStatus, startDemoApi, stopDemoApi } from './demo-api/server';
import { configureWorkflowsPorts, workflowsLog, type WorkflowsPorts } from './ports';
import { initTriggerScheduler, reconcileTriggerScheduler } from './workflow/trigger-scheduler';
import { abortInFlightRuns } from './workflow/workflow-engine';
import {
  cancelRun,
  configureWorkflows,
  decideGate,
  deleteWorkflow,
  getRun,
  getWorkflowRunHistoryCap,
  listRunsForWorkflow,
  listWorkflows,
  onWorkflowsChanged,
  pollWorkflowGateApprovals,
  resumeRun,
  runWorkflow,
  saveWorkflow,
  setWorkflowDefaults,
} from './workflow-service';
import { createWorkflowRunsStore } from './workflow-runs-store';
import { createWorkflowsStore } from './workflows-store';
import {
  configureWorkflowTemplates,
  createWorkflowTemplatesStore,
  deleteWorkflowTemplate,
  listWorkflowTemplates,
  saveWorkflowTemplate,
} from './workflow-templates-store';

export { workflowsManifest, type WorkflowsManifest } from '../manifest';
export * from './ports';
export { startFixtureServer, type FixtureServer } from './demo-api/fixture-server';
export { stopDemoApi } from './demo-api/server';
export { TRIGGER_SCHEDULER_SUBSCRIBER_ID } from './workflow/trigger-scheduler';
export { HTTP_RESPONSE_CAP_BYTES, readCapped } from './workflow/executors/http';
export {
  configureWorkflows,
  decideGate,
  getRun,
  listRunsForWorkflow,
  listWaitingGates,
  listWorkflows,
  pollWorkflowGateApprovals,
  runWorkflow,
  setWorkflowDefaults,
} from './workflow-service';
export { nullWorkflowRunsStore, createWorkflowRunsStore, type WorkflowRunsStore } from './workflow-runs-store';
export { nullWorkflowsStore, createWorkflowsStore, type WorkflowsStore } from './workflows-store';
export {
  configureWorkflowTemplates,
  createWorkflowTemplatesStore,
  nullWorkflowTemplatesStore,
} from './workflow-templates-store';

/**
 * The workflows feature's main half (Phase 113 Theme N).
 *
 * Global CRUD plus the run lifecycle. There is no per-run output channel: a
 * run's progress is the {@link EVENT_CHANNELS.workflowRunChanged} event
 * `workflow-service.ts` emits with the run itself, which the renderer answers by
 * re-fetching the one run it is looking at.
 *
 * `register` configures everything the feature owns from `dataDirectory`: the
 * workflow, run-history and template stores, the trigger scheduler (cron
 * schedules fire with no ports at all; forge triggers ride the `forge` port when
 * there is one) and, when the composer asks for it, the gate approval poll. What a
 * node reaches *outside* the engine is the composer's {@link WorkflowsPorts}.
 */
export type WorkflowsMainServices = {
  ports: WorkflowsPorts;
  /** Where `workflows.json`, `workflow-runs.json` and the template store live. */
  dataDirectory: string;
  /**
   * How often to poll forge comments for a waiting gate's decision. Absent means never — an app
   * with no forge port has nothing to poll. Studio passes the forge poller's own cadence.
   */
  gateApprovalPollMs?: number;
};

let gateApprovalTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Stops the feature's own background work and kills what it spawned: the gate poll, the demo API
 * and every in-flight run (each run's cancel poll kills its node's child process group). An app
 * calls it on quit; Studio does not (its runs survive a quit as `interrupted`, resumable).
 */
export async function disposeWorkflows(): Promise<void> {
  if (gateApprovalTimer !== null) clearInterval(gateApprovalTimer);
  gateApprovalTimer = null;
  await stopDemoApi();
  await abortInFlightRuns();
}

export const workflowsMain = defineFeatureMain<WorkflowsMainServices>({
  feature: workflowsManifest.feature,
  channels: workflowsManifest.ipc,
  register(ctx, services) {
    const { ipc } = ctx;
    configureWorkflowsPorts(services.ports);
    configureWorkflows(
      createWorkflowsStore(services.dataDirectory),
      createWorkflowRunsStore(services.dataDirectory, getWorkflowRunHistoryCap),
      ctx.emit,
    );
    configureWorkflowTemplates(createWorkflowTemplatesStore(services.dataDirectory));

    // Phase 97 Theme H — arms `trigger` nodes for every enabled workflow, now and whenever one is saved or deleted.
    initTriggerScheduler(workflowsLog());
    const reconcile = (): void => {
      void listWorkflows().then((workflows) => reconcileTriggerScheduler(workflows));
    };
    reconcile();
    onWorkflowsChanged(reconcile);

    if (services.gateApprovalPollMs !== undefined) {
      if (gateApprovalTimer !== null) clearInterval(gateApprovalTimer);
      gateApprovalTimer = setInterval(() => void pollWorkflowGateApprovals(), services.gateApprovalPollMs);
      gateApprovalTimer.unref();
    }

    ipc.handleBare(CHANNELS.workflowList, async () => ({ workflows: await listWorkflows() }));

    ipc.handle(
      CHANNELS.workflowSave,
      schemas.WorkflowSaveRequest,
      async ({ workflow }) => ok(await saveWorkflow(workflow)),
      (issue) => failure(issue),
    );

    ipc.handle(
      CHANNELS.workflowDelete,
      schemas.WorkflowDeleteRequest,
      async ({ id }) => deleteWorkflow(id),
      (issue) => failure(issue),
    );

    ipc.handle(
      CHANNELS.workflowRun,
      schemas.WorkflowRunRequest,
      async ({ workflowId }) => runWorkflow(workflowId),
      (issue) => failure(issue),
    );

    ipc.handle(
      CHANNELS.workflowCancel,
      schemas.WorkflowCancelRequest,
      async ({ runId }) => cancelRun(runId),
      (issue) => failure(issue),
    );

    ipc.handle(
      CHANNELS.workflowResume,
      schemas.WorkflowResumeRequest,
      async ({ runId }) => resumeRun(runId),
      (issue) => failure(issue),
    );

    ipc.handle(
      CHANNELS.workflowGateDecide,
      schemas.WorkflowGateDecideRequest,
      async ({ runId, nodeId, decision, note }) => decideGate(runId, nodeId, decision, note, 'panel'),
      (issue) => failure(issue),
    );

    ipc.handle(
      CHANNELS.workflowRunsList,
      schemas.WorkflowRunsListRequest,
      async ({ workflowId }) => ({ runs: await listRunsForWorkflow(workflowId) }),
      () => ({ runs: [] }),
    );

    ipc.handle(
      CHANNELS.workflowRunsGet,
      schemas.WorkflowRunsGetRequest,
      async ({ runId }) => ({ run: await getRun(runId) }),
      () => ({ run: null }),
    );

    ipc.handleBare(CHANNELS.workflowTemplatesList, async () => ({ templates: await listWorkflowTemplates() }));

    ipc.handle(
      CHANNELS.workflowTemplateSave,
      schemas.WorkflowTemplateSaveRequest,
      async ({ template }) => saveWorkflowTemplate(template),
      (issue) => failure(issue),
    );

    ipc.handle(
      CHANNELS.workflowTemplateDelete,
      schemas.WorkflowTemplateDeleteRequest,
      async ({ id }) => deleteWorkflowTemplate(id),
      (issue) => failure(issue),
    );

    ipc.send(
      CHANNELS.workflowSetDefaults,
      schemas.WorkflowSetDefaultsRequest,
      (payload) => setWorkflowDefaults(payload),
      (issue) => workflowsLog().warn(issue),
    );

    // The demo API (Phase 43 Theme D) — payload-free; a failed bind is an envelope, not a rejected invoke.
    ipc.handleBare(CHANNELS.demoApiStart, async () => {
      try {
        return ok(await startDemoApi());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return failure(`The demo API could not start: ${message}`);
      }
    });
    ipc.handleBare(CHANNELS.demoApiStop, async () => {
      await stopDemoApi();
      return ok();
    });
    ipc.handleBare(CHANNELS.demoApiStatus, () => demoApiStatus());
  },
});
