import {
  CHANNELS,
  failure,
  ok,
  schemas,
  type GitOpResult,
  type ScaffoldApplyResult,
  type ScaffoldPlan,
} from '@midnite/studio-shared';

import { resolveWorkdir } from '../repo-registry';
import { applyScaffold, planScaffold } from '../scaffold';
import { templateRoot } from '../template-path';
import { handle } from './handle';

const REPO_NOT_OPEN_MESSAGE = 'That repository is not open.';

/**
 * The onboarding kit's two channels — see `../scaffold/index.ts` for the
 * policy. Both carry a `repoId` and nothing else: main resolves the checkout
 * through `resolveWorkdir`, the same rule `diag-handlers.ts` follows, so the
 * renderer names a repo it already has open rather than an arbitrary path.
 */
export function registerScaffoldHandlers(): void {
  handle<typeof schemas.ScaffoldPlanRequest, GitOpResult<ScaffoldPlan>>(
    CHANNELS.scaffoldPlan,
    schemas.ScaffoldPlanRequest,
    async (req) => {
      const workdir = await resolveWorkdir(req.repoId);
      if (!workdir) return failure<ScaffoldPlan>(REPO_NOT_OPEN_MESSAGE);
      return planScaffold(templateRoot(), workdir);
    },
    (issue) => failure(issue),
  );

  handle<typeof schemas.ScaffoldApplyRequest, GitOpResult<ScaffoldApplyResult>>(
    CHANNELS.scaffoldApply,
    schemas.ScaffoldApplyRequest,
    async (req) => {
      const workdir = await resolveWorkdir(req.repoId);
      if (!workdir) return failure<ScaffoldApplyResult>(REPO_NOT_OPEN_MESSAGE);
      return ok(await applyScaffold(templateRoot(), workdir, req.paths));
    },
    (issue) => failure(issue),
  );
}
