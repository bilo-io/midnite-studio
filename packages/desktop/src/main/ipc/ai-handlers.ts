import {
  CHANNELS,
  failure,
  schemas,
  type AiPlanBlueprint,
  type GitOpResult,
} from '@midnite/studio-shared';

import { generateCommitMessage } from '../ai/commit-message';
import { improveField } from '../ai/improve-field';
import { planBlueprint } from '../ai/plan-blueprint';
import { resolveWorkdir } from '../repo-registry';
import { handle } from './handle';

/**
 * The wand (Phase 95 Theme E) and Plan with AI (Theme F) —
 * `mcp-handlers.ts`'s own "forward to the module that does the work,
 * register nothing else here" shape, mirroring `companion-handlers.ts`'s
 * `companionAsk` registration exactly: `handle` answers a rejected payload
 * with the same `GitOpResult` envelope a channel failure would, rather than a
 * thrown validation error.
 */
export function registerAiHandlers(): void {
  handle<
    typeof schemas.AiCommitMessageRequest,
    GitOpResult<{ text: string; source: 'staged' | 'working' }>
  >(
    CHANNELS.aiCommitMessage,
    schemas.AiCommitMessageRequest,
    async (req) => {
      const cwd = await resolveWorkdir(req.repoId, req.worktreePath);
      if (!cwd) return failure('That repository is not open.');
      return generateCommitMessage({ cwd, agentId: req.agentId, ollamaModel: req.ollamaModel });
    },
    (issue) => failure(issue),
  );

  handle<typeof schemas.AiImproveFieldRequest, GitOpResult<{ text: string }>>(
    CHANNELS.aiImproveField,
    schemas.AiImproveFieldRequest,
    (req) =>
      improveField({
        agentId: req.agentId,
        repoPath: req.repoPath ?? null,
        repoName: req.repoName,
        fieldName: req.fieldName,
        fieldValue: req.fieldValue,
        otherFields: req.otherFields,
        ollamaModel: req.ollamaModel,
      }),
    (issue): GitOpResult<{ text: string }> => failure(issue),
  );

  handle<typeof schemas.AiPlanBlueprintRequest, GitOpResult<{ blueprint: AiPlanBlueprint }>>(
    CHANNELS.aiPlanBlueprint,
    schemas.AiPlanBlueprintRequest,
    (req) =>
      planBlueprint({
        agentId: req.agentId,
        repoPath: req.repoPath ?? null,
        repoName: req.repoName,
        prompt: req.prompt,
        existing: req.existing,
        originIssue: req.originIssue,
        ollamaModel: req.ollamaModel,
      }),
    (issue): GitOpResult<{ blueprint: AiPlanBlueprint }> => failure(issue),
  );
}
