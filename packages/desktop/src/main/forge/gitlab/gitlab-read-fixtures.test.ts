import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Forge, ForgeAccount } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { listPulls } from './gitlab-read';

// See `gh-parse-fixtures.test.ts`'s own note on why this is `readFileSync`,
// not `import … from '*.json'` (TS6307 under desktop's inherited `composite: true`).
const mrList: unknown = JSON.parse(readFileSync(join(__dirname, '__fixtures__/gitlab-mr-list.json'), 'utf8'));

/**
 * Phase 90 Theme K — fixture-driven mapper test.
 *
 * `gitlab-mappers.test.ts` already table-tests the pure mapping functions
 * against minimal literals, and `gitlab-read.test.ts` already covers
 * `listPulls`'s branch logic with one hand-built MR. This is the
 * complementary check: a **captured response shape** — three real MRs'
 * worth of the noisy extra fields GitLab's `merge_requests` endpoint
 * actually sends (`project_id`, `description`, `target_branch`, a nested
 * `author` object, a `head_pipeline` sub-object) that the existing literal
 * never carries — run end to end through `listPulls`, the real read-surface
 * function `create-gitlab-adapter.ts` binds onto `ForgeAdapter`, not a
 * private mapper called directly.
 */

const forge: Forge = { host: 'gitlab.com', owner: 'midnite', repo: 'studio', kind: 'gitlab' };
const account: ForgeAccount = {
  id: 'gitlab:gitlab.com:bilo',
  kind: 'gitlab',
  host: 'gitlab.com',
  login: 'bilo',
  displayName: 'Bilo Lwabona',
  avatarUrl: null,
  addedAt: 0,
  hasToken: true,
  delegated: null,
};

vi.mock('../forge-accounts', () => ({ forgeAccountToken: vi.fn().mockResolvedValue('glpat-token') }));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('listPulls — fixture (gitlab-mr-list.json)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps all three merge requests, tolerant of every extra field the real endpoint sends', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, mrList)));

    const result = await listPulls(forge, account, { limit: 20, state: 'all' });

    expect(result.error).toBeNull();
    expect(result.pulls).toHaveLength(3);

    expect(result.pulls[0]).toEqual({
      id: '88213',
      number: 214,
      title: 'Add rate limiter to fetch pipeline',
      state: 'open',
      isDraft: false,
      // `listPulls` never fetches per-MR approvals — see `mapPull`'s own note.
      reviewDecision: null,
      checks: 'passing',
      headBranch: 'feature/fetch-rate-limiter',
      author: 'bilo',
      url: 'https://gitlab.com/midnite/studio/-/merge_requests/214',
      mergedAt: null,
      closedAt: null,
    });

    expect(result.pulls[1]).toMatchObject({
      number: 207,
      state: 'merged',
      mergedAt: '2026-09-06T17:45:11.000Z',
      checks: 'passing',
    });

    expect(result.pulls[2]).toMatchObject({
      number: 199,
      state: 'closed',
      // GitLab's `draft`/`work_in_progress` OR — either flags a draft.
      isDraft: true,
      checks: 'failing',
    });
  });
});
