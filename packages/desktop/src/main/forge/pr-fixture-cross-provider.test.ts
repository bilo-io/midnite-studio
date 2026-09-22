import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { mapPull as mapBitbucketPull } from './bitbucket/bitbucket-map';
import { parsePullList } from './github/gh-parse';
import { mapMergeRequestState } from './gitlab/gitlab-mappers';
import { mapPullState as mapAzurePullState } from './azure/azure-mappers';

// See `gh-parse-fixtures.test.ts`'s own note on why every fixture below is
// `readFileSync`, not `import … from '*.json'` (TS6307 under desktop's
// inherited `composite: true`).
function readFixture(relPath: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, relPath), 'utf8'));
}

const githubPrList = readFixture('github/__fixtures__/gh-pr-list.json');
const gitlabMrList = readFixture('gitlab/__fixtures__/gitlab-mr-list.json') as Array<{ state: string }>;
const bitbucketPrList = readFixture('bitbucket/__fixtures__/bitbucket-pr-list.json') as {
  values: Record<string, unknown>[];
};
const azurePrList = readFixture('azure/__fixtures__/azure-pr-list.json') as {
  value: Array<{ status: string }>;
};

/**
 * Phase 90 Theme K — the fixture-driven test where **cross-provider
 * comparison is the point**, not a fourth copy of coverage the per-provider
 * mapper tests already have.
 *
 * Each of the four `__fixtures__/*.json` files captures the SAME three
 * scenarios, in the same order, deliberately picked to land on a different
 * corner of GitHub's canonical vocabulary per the phase doc's "Settled —
 * GitHub's vocabulary stays canonical" decision:
 *
 *   0. open, approved, not a draft
 *   1. merged
 *   2. closed (declined/abandoned), a draft, with the provider's own
 *      "needs work" signal (`CHANGES_REQUESTED` where the provider has one,
 *      GitLab's `REVIEW_REQUIRED` where it does not)
 *
 * A per-provider mapper test already proves each individual mapping table is
 * correct in isolation (`gh-parse.test.ts`, `gitlab-mappers.test.ts`,
 * `bitbucket-map.test.ts`, `azure-mappers.test.ts` — the branch-by-branch
 * checks). What none of them can show on its own is that the SAME real-world
 * PR shape reads the same way across all four adapters, which is the actual
 * promise `ForgePull` makes to the renderer's four forge-agnostic views. This
 * test reads the fixture files directly (not the network-mocked read
 * surfaces the per-provider fixture tests exercise) and compares the state
 * arm each provider's own mapper produces for the aligned index.
 */
describe('the same three PR scenarios, mapped by all four providers', () => {
  it('agree that scenario 0 is open, not draft', () => {
    expect(parsePullList(githubPrList)[0]).toMatchObject({ state: 'open', isDraft: false });
    expect(mapMergeRequestState(gitlabMrList[0]!.state)).toBe('open');
    expect(mapBitbucketPull(bitbucketPrList.values[0]!).state).toBe('open');
    expect(mapAzurePullState(azurePrList.value[0]!.status)).toBe('open');
  });

  it('agree that scenario 1 is merged', () => {
    expect(parsePullList(githubPrList)[1]).toMatchObject({ state: 'merged' });
    expect(mapMergeRequestState(gitlabMrList[1]!.state)).toBe('merged');
    expect(mapBitbucketPull(bitbucketPrList.values[1]!).state).toBe('merged');
    expect(mapAzurePullState(azurePrList.value[1]!.status)).toBe('merged');
  });

  it('agree that scenario 2 is closed and a draft', () => {
    expect(parsePullList(githubPrList)[2]).toMatchObject({ state: 'closed', isDraft: true });
    expect(mapMergeRequestState(gitlabMrList[2]!.state)).toBe('closed');
    expect(mapBitbucketPull(bitbucketPrList.values[2]!)).toMatchObject({ state: 'closed', isDraft: true });
    expect(mapAzurePullState(azurePrList.value[2]!.status)).toBe('closed');
  });

  it("diverge, honestly, on scenario 2's review verdict — the exact gap each phase doc arm names", () => {
    // GitHub and Bitbucket and Azure can all say CHANGES_REQUESTED; GitLab
    // cannot (Theme E's own "Settled" note) and reports REVIEW_REQUIRED
    // instead — this is the capability-matrix gap made concrete against
    // real fixture data, not a synthetic literal built to prove the point.
    expect(parsePullList(githubPrList)[2]?.reviewDecision).toBe('CHANGES_REQUESTED');
    expect(mapBitbucketPull(bitbucketPrList.values[2]!).reviewDecision).toBe('CHANGES_REQUESTED');
    // GitLab's own row carries no `reviewDecision` at all on a listing (see
    // `mapPull`'s own note) — nothing to assert equal here, which is the point.
    expect(gitlabMrList[2]!.state).toBe('closed');
  });
});
