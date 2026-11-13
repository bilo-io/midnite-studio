import { defineFeatureMain } from '@midnite/studio-runtime';
import { CHANNELS, failure, ok, schemas } from '@midnite/studio-shared';

import { councilsManifest } from '../manifest';
import { generateCouncil, recommendCouncil } from './council-recommend';
import {
  cancelRun,
  configureCouncilRunner,
  continueRun,
  reconcileRun,
  retryMember,
  skipMember,
  startRun,
  type CouncilRunnerPorts,
} from './council-runner';
import {
  createCouncil,
  getCouncil,
  getRun,
  listCouncils,
  listRunsForCouncil,
  removeCouncil,
  updateCouncilMembers,
} from './council-service';

export { councilsManifest, type CouncilsManifest } from '../manifest';
export { configureCouncilRunner, type CouncilRunnerPorts } from './council-runner';
export {
  configureCouncils,
  getCouncil,
  getRun,
  listCouncils,
  listRunsForCouncil,
  resetCouncilsForTest,
  saveRun,
} from './council-service';
export { createCouncilsRunsStore, MAX_STORED_RUNS, nullCouncilsRunsStore, type CouncilsRunsStore } from './councils-runs-store';
export { createCouncilsStore, nullCouncilsStore, type CouncilsStore } from './councils-store';

/**
 * The councils feature's main half (Phase 113 Theme N).
 *
 * Agent councils (Phase 34) — global CRUD plus run lifecycle, follow-up turns,
 * cancel and recommend (Phase 133). A member's or
 * the synthesizer's live output rides the existing `pty:*` channels, filtered
 * by the `ptyId` a running `councilRunGet` answer carries, so there is no
 * separate council-scoped event channel here.
 *
 * Where the two stores live is the composer's call (it calls
 * {@link configureCouncils} with stores over a directory it chose). What a run
 * *spawns with* is its {@link CouncilRunnerPorts}: the pty broker, the agent
 * roster, the Ollama daemon and the Ollama cloud key — the last read here in
 * main and typed into one pty's environment, never an answer to any channel.
 */
export type CouncilsMainServices = {
  runner: CouncilRunnerPorts;
};

export const councilsMain = defineFeatureMain<CouncilsMainServices>({
  feature: councilsManifest.feature,
  channels: councilsManifest.ipc,
  register(ctx, services) {
    const { ipc } = ctx;
    configureCouncilRunner(services.runner);

    ipc.handleBare(CHANNELS.councilList, async () => ({ councils: await listCouncils() }));

    ipc.handle(
      CHANNELS.councilGet,
      schemas.CouncilGetRequest,
      async ({ id }) => ({ council: await getCouncil(id) }),
      () => ({ council: null }),
    );

    ipc.handle(
      CHANNELS.councilCreate,
      schemas.CouncilCreateRequest,
      async ({ name, description, members, synthProvider, synthModel, synthesisType, synthInstructions }) =>
        ok(await createCouncil(name, description, { members, synthProvider, synthModel, synthesisType, synthInstructions })),
      (issue) => failure(issue),
    );

    ipc.handle(
      CHANNELS.councilUpdateMembers,
      schemas.CouncilUpdateMembersRequest,
      async ({ id, members, synthProvider, synthModel, synthesisType, synthInstructions }) => {
        const updated = await updateCouncilMembers(id, members, synthProvider, synthModel, {
          type: synthesisType,
          instructions: synthInstructions,
        });
        return updated ? ok(updated) : failure('Council not found.');
      },
      (issue) => failure(issue),
    );

    ipc.handle(
      CHANNELS.councilRemove,
      schemas.CouncilRemoveRequest,
      async ({ id }) => {
        const removed = await removeCouncil(id);
        return removed ? ok() : failure('Council not found.');
      },
      (issue) => failure(issue),
    );

    ipc.handle(
      CHANNELS.councilRunStart,
      schemas.CouncilRunStartRequest,
      async ({ councilId, prompt }) => startRun(councilId, prompt),
      (issue) => failure(issue),
    );

    ipc.handle(
      CHANNELS.councilRunGet,
      schemas.CouncilRunGetRequest,
      async ({ runId }) => {
        const run = await getRun(runId);
        return { run: run ? await reconcileRun(run) : null };
      },
      () => ({ run: null }),
    );

    ipc.handle(
      CHANNELS.councilRunListForCouncil,
      schemas.CouncilRunListRequest,
      async ({ councilId }) => ({ runs: await Promise.all((await listRunsForCouncil(councilId)).map(reconcileRun)) }),
      () => ({ runs: [] }),
    );

    ipc.handle(
      CHANNELS.councilRunSkipMember,
      schemas.CouncilRunSkipMemberRequest,
      async ({ runId, memberId }) => skipMember(runId, memberId),
      (issue) => failure(issue),
    );

    ipc.handle(
      CHANNELS.councilRunRetryMember,
      schemas.CouncilRunRetryMemberRequest,
      async ({ runId, memberId }) => retryMember(runId, memberId),
      (issue) => failure(issue),
    );

    ipc.handle(
      CHANNELS.councilRunCancel,
      schemas.CouncilRunCancelRequest,
      async ({ runId }) => cancelRun(runId),
      (issue) => failure(issue),
    );

    ipc.handle(
      CHANNELS.councilRunContinue,
      schemas.CouncilRunContinueRequest,
      async ({ runId, prompt }) => continueRun(runId, prompt),
      (issue) => failure(issue),
    );

    ipc.handle(
      CHANNELS.councilRecommend,
      schemas.CouncilRecommendRequest,
      async (request) => recommendCouncil(request),
      (issue) => failure(issue),
    );

    ipc.handle(
      CHANNELS.councilGenerate,
      schemas.CouncilGenerateRequest,
      async (request) => generateCouncil(request),
      (issue) => failure(issue),
    );
  },
});
