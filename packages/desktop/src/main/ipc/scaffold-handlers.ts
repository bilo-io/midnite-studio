import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  CHANNELS,
  failure,
  ok,
  schemas,
  type GitOpResult,
  type InstallUserSkillsResult,
  type ScaffoldApplyResult,
  type ScaffoldPlan,
} from '@midnite/studio-shared';

import { resolveWorkdir } from '../repo-registry';
import { applyScaffold, installUserSkills, planScaffold } from '../scaffold';
import { templateRoot } from '../template-path';
import { handle } from './handle';

const REPO_NOT_OPEN_MESSAGE = 'That repository is not open.';

/**
 * The onboarding kit's channels — see `../scaffold/index.ts` for the
 * policy. `plan` and `apply` carry a `repoId`: main resolves the checkout
 * through `resolveWorkdir`. `installUserSkills` installs the kit's skills to
 * the user's `~/.claude/skills` folder.
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

  handle<typeof schemas.InstallUserSkillsRequest, GitOpResult<InstallUserSkillsResult>>(
    CHANNELS.scaffoldInstallUserSkills,
    schemas.InstallUserSkillsRequest,
    async () => {
      const sourceDir = join(templateRoot(), '.claude', 'skills');
      const targetDir = join(homedir(), '.claude', 'skills');
      return installUserSkills(sourceDir, targetDir);
    },
    (issue) => failure(issue),
  );
}
