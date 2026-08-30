import type { ForgePull } from '@midnite/studio-shared';
import { ForgePullSchema } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { pullStatus } from './forge-status';

/*
  Built through the schema rather than as an object literal, for the same
  reason `checks-verdict.test.ts` does it: a hand-written fixture would go
  stale every time `ForgePull` grew a field this test does not care about.
*/
const pull = (over: Partial<ForgePull> = {}): ForgePull =>
  ForgePullSchema.parse({
    number: 1,
    title: 'Untitled',
    state: 'open',
    isDraft: false,
    headBranch: 'feature/x',
    url: 'https://github.com/o/r/pull/1',
    ...over,
  });

/*
  `toMatchObject`, not `toEqual`: every assertion here is about which verdict
  *wins* — merged over approved, draft over changes-requested. A status now also
  carries the glyph that draws it, and pinning that in this file would make
  every one of these cases fail the next time a mark is swapped for a clearer
  one, for a reason none of them is testing.
*/
describe('pullStatus', () => {
  it('reads merged and closed off state, not reviewDecision', () => {
    // Phase 20 B fetches every state, so a merged/closed PR now reaches this
    // function carrying whatever reviewDecision it had while open — reading
    // that instead of `state` would render a merged PR as "Approved".
    expect(pullStatus(pull({ state: 'merged', reviewDecision: 'APPROVED' }))).toMatchObject({
      tone: 'ok',
      label: 'Merged',
    });
    expect(pullStatus(pull({ state: 'closed', reviewDecision: null }))).toMatchObject({
      tone: 'idle',
      label: 'Closed',
    });
  });

  it('merged/closed outrank draft', () => {
    expect(pullStatus(pull({ state: 'merged', isDraft: true }))).toMatchObject({
      tone: 'ok',
      label: 'Merged',
    });
  });

  it('draft wins over an open PR’s review decision', () => {
    expect(pullStatus(pull({ isDraft: true, reviewDecision: 'CHANGES_REQUESTED' }))).toMatchObject({
      tone: 'idle',
      label: 'Draft',
    });
  });

  it('an open PR still reads its review decision', () => {
    expect(pullStatus(pull({ reviewDecision: 'APPROVED' }))).toMatchObject({
      tone: 'ok',
      label: 'Approved',
    });
    expect(pullStatus(pull({ reviewDecision: 'CHANGES_REQUESTED' }))).toMatchObject({
      tone: 'fail',
      label: 'Changes requested',
    });
    expect(pullStatus(pull({ reviewDecision: 'REVIEW_REQUIRED' }))).toMatchObject({
      tone: 'warn',
      label: 'Review required',
    });
    expect(pullStatus(pull({ reviewDecision: null }))).toMatchObject({ tone: 'idle', label: 'Open' });
  });
});
