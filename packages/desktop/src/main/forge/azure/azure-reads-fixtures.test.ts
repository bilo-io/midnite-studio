import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Forge, ForgeAccount } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { listPulls } from './azure-reads';

// See `github/gh-parse-fixtures.test.ts`'s own note on why this is
// `readFileSync`, not `import … from '*.json'` (TS6307 under desktop's
// inherited `composite: true`).
const prList: unknown = JSON.parse(readFileSync(join(__dirname, '__fixtures__/azure-pr-list.json'), 'utf8'));

/**
 * Phase 90 Theme K — fixture-driven mapper test.
 *
 * `azure-mappers.test.ts` already table-tests `mapReviewDecision` and its
 * siblings against hand-built literals, and `azure-reads.test.ts` already
 * covers `listPulls`'s branch logic (a plain approval, and the `-10`/`-5`
 * vote distinction the phase doc warns a naive mapper gets wrong) against
 * one and two-row literals it builds inline. This is the complementary
 * check: a **captured response shape** — three real-shaped PRs, the noisy
 * `codeReviewId`, `mergeId`, `lastMergeSourceCommit`/`lastMergeTargetCommit`
 * fields a real Azure Repos response actually carries, none of which either
 * existing test's literal includes — run end to end through `listPulls`.
 */
const forge: Forge = { host: 'dev.azure.com', owner: 'contoso/platform', repo: 'studio', kind: 'azure' };
const account: ForgeAccount = {
  id: 'azure:dev.azure.com:bilo@contoso.com',
  kind: 'azure',
  host: 'dev.azure.com',
  login: 'bilo@contoso.com',
  displayName: 'Bilo Lwabona',
  avatarUrl: null,
  addedAt: 0,
  hasToken: true,
  delegated: null,
};

vi.mock('../forge-accounts', () => ({ forgeAccountToken: vi.fn().mockResolvedValue('azure-pat') }));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('listPulls — fixture (azure-pr-list.json)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps a {value: [...]} pull request envelope end to end, tolerant of every extra field', async () => {
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
      // vote 10 — a plain approval, the case a naive `vote < 0` shortcut
      // would also get right, kept here as the baseline against the other
      // two rows' `-10`.
      reviewDecision: 'APPROVED',
      // Azure has no rolled-up check on the listing row itself.
      checks: null,
      headBranch: 'feature/fetch-rate-limiter',
      author: 'bilo@contoso.com',
      url: 'https://dev.azure.com/contoso/platform/_git/studio/pullrequest/412',
      mergedAt: null,
      closedAt: null,
    });

    expect(result.pulls[1]).toMatchObject({
      number: 407,
      state: 'merged',
      mergedAt: '2026-09-06T17:45:11.0000000Z',
      closedAt: null,
    });

    expect(result.pulls[2]).toMatchObject({
      number: 399,
      state: 'closed',
      isDraft: true,
      // vote -10 — the only true reject.
      reviewDecision: 'CHANGES_REQUESTED',
      mergedAt: null,
      closedAt: '2026-08-29T16:00:00.0000000Z',
    });
  });
});
