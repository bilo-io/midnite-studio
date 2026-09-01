import { CHANNELS, failure, ok, schemas } from '@midnite/studio-shared';

import {
  createCouncil,
  getCouncil,
  getRun,
  listCouncils,
  listRunsForCouncil,
  removeCouncil,
  updateCouncilMembers,
} from '../council-service';
import { retryMember, skipMember, startRun } from '../council-runner';
import { handle, handleBare } from './handle';

/**
 * Agent councils (Phase 34) — global CRUD plus run lifecycle. A member's or
 * the synthesizer's live output rides the existing `pty:*` channels, filtered
 * by the `ptyId` a running `councilRunGet` answer carries, so there is no
 * separate council-scoped event channel to register here.
 */
export function registerCouncilHandlers(): void {
  handleBare(CHANNELS.councilList, async () => ({ councils: await listCouncils() }));

  handle(
    CHANNELS.councilGet,
    schemas.CouncilGetRequest,
    async ({ id }) => ({ council: await getCouncil(id) }),
    () => ({ council: null }),
  );

  handle(
    CHANNELS.councilCreate,
    schemas.CouncilCreateRequest,
    async ({ name, description }) => ok(await createCouncil(name, description)),
    (issue) => failure(issue),
  );

  handle(
    CHANNELS.councilUpdateMembers,
    schemas.CouncilUpdateMembersRequest,
    async ({ id, members, synthProvider }) => {
      const updated = await updateCouncilMembers(id, members, synthProvider);
      return updated ? ok(updated) : failure('Council not found.');
    },
    (issue) => failure(issue),
  );

  handle(
    CHANNELS.councilRemove,
    schemas.CouncilRemoveRequest,
    async ({ id }) => {
      const removed = await removeCouncil(id);
      return removed ? ok() : failure('Council not found.');
    },
    (issue) => failure(issue),
  );

  handle(
    CHANNELS.councilRunStart,
    schemas.CouncilRunStartRequest,
    async ({ councilId, prompt }) => startRun(councilId, prompt),
    (issue) => failure(issue),
  );

  handle(
    CHANNELS.councilRunGet,
    schemas.CouncilRunGetRequest,
    async ({ runId }) => ({ run: await getRun(runId) }),
    () => ({ run: null }),
  );

  handle(
    CHANNELS.councilRunListForCouncil,
    schemas.CouncilRunListRequest,
    async ({ councilId }) => ({ runs: await listRunsForCouncil(councilId) }),
    () => ({ runs: [] }),
  );

  handle(
    CHANNELS.councilRunSkipMember,
    schemas.CouncilRunSkipMemberRequest,
    async ({ runId, memberId }) => skipMember(runId, memberId),
    (issue) => failure(issue),
  );

  handle(
    CHANNELS.councilRunRetryMember,
    schemas.CouncilRunRetryMemberRequest,
    async ({ runId, memberId }) => retryMember(runId, memberId),
    (issue) => failure(issue),
  );
}
