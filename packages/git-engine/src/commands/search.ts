import type { Commit } from '@midnite/git-shared';

import { type LogOptions, type LogStream, streamLog } from './log';

export type CommitSearchOptions = LogOptions;

/**
 * Stream commit search results.
 * Mirrors `streamLog` with widened options.
 */
export function streamCommitSearch(
  repoPath: string,
  options: CommitSearchOptions,
  onBatch: (commits: Commit[]) => void,
  batchSize = 500,
): LogStream {
  return streamLog(repoPath, options, onBatch, batchSize);
}
