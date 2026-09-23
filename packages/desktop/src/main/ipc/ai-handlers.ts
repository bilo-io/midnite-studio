import { CHANNELS, failure, schemas, type GitOpResult } from '@midnite/studio-shared';

import { improveField } from '../ai/improve-field';
import { handle } from './handle';

/**
 * The wand (Phase 95 Theme E) — `mcp-handlers.ts`'s own "forward to the
 * module that does the work, register nothing else here" shape, mirroring
 * `companion-handlers.ts`'s `companionAsk` registration exactly: `handle`
 * answers a rejected payload with the same `GitOpResult` envelope a channel
 * failure would, rather than a thrown validation error.
 */
export function registerAiHandlers(): void {
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
      }),
    (issue): GitOpResult<{ text: string }> => failure(issue),
  );
}
