import type { z } from 'zod';

import { readGrep } from '@midnite/git-engine';
import {
  CHANNELS,
  FS_SEARCH_MAX_MATCHES,
  FS_SEARCH_MAX_MATCHES_PER_FILE,
  schemas,
} from '@midnite/git-shared';

import { resolveWorkdir } from '../repo-registry';
import { handle } from './handle';

type SearchResponse = z.infer<typeof schemas.FsSearchResponse>;

/**
 * Find in files (Phase 24 Theme E). Its own file rather than joining
 * `fs-handlers.ts`: that file's read surface is plain `node:fs`, confined by
 * `fs-scope.ts`; this one shells out through git-engine instead, so `resolveWorkdir`
 * is the trust boundary here, the same one every git-op handler crosses — not
 * `confineToRoot`, which has nothing to confine when the whole tree is in scope.
 */
export function registerFsSearchHandlers(): void {
  handle<typeof schemas.FsSearchRequest, SearchResponse>(
    CHANNELS.fsSearch,
    schemas.FsSearchRequest,
    (req) => search(req),
    (issue) => ({ ok: false, message: issue }),
  );
}

async function search(req: z.output<typeof schemas.FsSearchRequest>): Promise<SearchResponse> {
  const cwd = await resolveWorkdir(req.repoId, req.worktreePath);
  if (!cwd) return { ok: false, message: 'That repository is no longer open.' };

  const result = await readGrep(cwd, {
    query: req.query,
    mode: req.mode,
    caseSensitive: req.caseSensitive,
    wholeWord: req.wholeWord,
    maxPerFile: FS_SEARCH_MAX_MATCHES_PER_FILE,
  });
  if (!result.ok) return result;

  const truncated = result.matches.length > FS_SEARCH_MAX_MATCHES;
  return {
    ok: true,
    matches: truncated ? result.matches.slice(0, FS_SEARCH_MAX_MATCHES) : result.matches,
    truncated,
  };
}
