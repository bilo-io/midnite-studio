import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Forge, ForgeAccount } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { listPulls } from './bitbucket-reads';

// See `gh-parse-fixtures.test.ts`'s own note on why this is `readFileSync`,
// not `import … from '*.json'` (TS6307 under desktop's inherited `composite: true`).
const prList: unknown = JSON.parse(readFileSync(join(__dirname, '__fixtures__/bitbucket-pr-list.json'), 'utf8'));

/**
 * Phase 90 Theme K — fixture-driven mapper test.
 *
 * `bitbucket-map.test.ts` already table-tests `mapPull` and its siblings
 * against hand-built literals, but **`bitbucket-reads.ts` itself — the
 * async read surface `create-bitbucket-adapter.ts` binds onto `ForgeAdapter`,
 * the thing a real repo actually calls — has no test at all.** This closes
 * that gap the same way `gitlab-read.test.ts` already does for GitLab: a
 * captured, paginated `{values: [...]}` envelope (three real-shaped PRs, the
 * noisy `type`, `uuid`, nested `source`/`destination` objects a real
 * `/pullrequests` response actually carries) run end to end through
 * `listPulls`, not a private mapper called directly.
 */

const forge: Forge = { host: 'bitbucket.org', owner: 'midnite', repo: 'studio', kind: 'bitbucket' };
const account: ForgeAccount = {
  id: 'bitbucket:bitbucket.org:bilo',
  kind: 'bitbucket',
  host: 'bitbucket.org',
  login: 'bilo',
  displayName: 'Bilo Lwabona',
  avatarUrl: null,
  addedAt: 0,
  hasToken: true,
  delegated: null,
};

vi.mock('../forge-accounts', () => ({ forgeAccountToken: vi.fn().mockResolvedValue('bb-app-password') }));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('listPulls — fixture (bitbucket-pr-list.json)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps a paginated pullrequests envelope end to end', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, prList)));

    const result = await listPulls(forge, account, { limit: 20, state: 'all' });

    expect(result.error).toBeNull();
    expect(result.pulls).toHaveLength(3);

    expect(result.pulls[0]).toEqual({
      id: '412',
      number: 412,
      title: 'Add rate limiter to fetch pipeline',
      state: 'open',
      isDraft: false,
      reviewDecision: 'APPROVED',
      // Bitbucket reports build status per-commit, never rolled up on the PR itself.
      checks: null,
      headBranch: 'feature/fetch-rate-limiter',
      author: 'bilo',
      url: 'https://bitbucket.org/midnite/studio/pull-requests/412',
      mergedAt: null,
      closedAt: null,
    });

    expect(result.pulls[1]).toMatchObject({
      number: 407,
      state: 'merged',
      mergedAt: '2026-09-06T17:45:11.000000+00:00',
    });

    expect(result.pulls[2]).toMatchObject({
      number: 399,
      state: 'closed',
      isDraft: true,
      reviewDecision: 'CHANGES_REQUESTED',
      closedAt: '2026-08-29T16:00:00.000000+00:00',
    });
  });
});
