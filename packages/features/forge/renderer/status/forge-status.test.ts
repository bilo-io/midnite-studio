import type { ForgeJob, ForgePull, ForgeRun } from '@midnite/studio-shared';
import { ForgeJobSchema, ForgePullSchema, ForgeRunSchema } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { jobStatus, mergeVerb, prState, prStateDescription, pullStatus, runStatus } from './forge-status';

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

const run = (over: Partial<ForgeRun> = {}): ForgeRun =>
  ForgeRunSchema.parse({
    id: 'r1',
    name: 'CI',
    status: 'completed',
    createdAt: '2026-09-17T12:00:00Z',
    url: 'https://github.com/o/r/actions/runs/1',
    ...over,
  });

const job = (over: Partial<ForgeJob> = {}): ForgeJob =>
  ForgeJobSchema.parse({
    id: 'j1',
    name: 'build',
    status: 'completed',
    ...over,
  });

/*
 * Only an `in_progress` run/job is actually doing something — the run-list
 * and run-detail panes read `spin`/`pulse` off this status to choose a
 * shimmer (genuinely in flight) over a slow opacity pulse (held up, not
 * moving) or neither (settled). `queued`/`requested`/`pending`/`waiting` all
 * mean "not moving yet" and must never spin; `completed` must never do
 * either, whatever its conclusion.
 */
/** `!!` collapses `true | undefined` to a plain boolean so a table of expectations reads flat. */
const flags = (status: { spin?: true; pulse?: true }) => ({
  spin: !!status.spin,
  pulse: !!status.pulse,
});

describe('runStatus / jobStatus: spin vs. pulse', () => {
  it('spins only in_progress, and never pulses it', () => {
    expect(flags(runStatus(run({ status: 'in_progress' })))).toEqual({ spin: true, pulse: false });
    expect(flags(jobStatus(job({ status: 'in_progress' })))).toEqual({ spin: true, pulse: false });
  });

  it.each(['queued', 'requested', 'pending', 'waiting'] as const)(
    'pulses %s and never spins it',
    (status) => {
      expect(flags(runStatus(run({ status })))).toEqual({ spin: false, pulse: true });
      expect(flags(jobStatus(job({ status })))).toEqual({ spin: false, pulse: true });
    },
  );

  it('gives a completed run/job neither spin nor pulse, whatever its conclusion', () => {
    for (const conclusion of ['success', 'failure', 'cancelled', 'skipped'] as const) {
      expect(flags(runStatus(run({ status: 'completed', conclusion })))).toEqual({
        spin: false,
        pulse: false,
      });
      expect(flags(jobStatus(job({ status: 'completed', conclusion })))).toEqual({
        spin: false,
        pulse: false,
      });
    }
  });

  it('reads a job queued behind a busy runner off its OWN status, not its parent run', () => {
    // GitHub reports this exact shape: the run is already `in_progress`, but a
    // job still waiting for a free runner is `queued` with no `started_at`.
    const parentRun = run({ status: 'in_progress' });
    const waitingJob = job({ status: 'queued', startedAt: null });

    expect(flags(runStatus(parentRun))).toEqual({ spin: true, pulse: false });
    expect(flags(jobStatus(waitingJob))).toEqual({ spin: false, pulse: true });
  });
});

describe('prState / prStateDescription / mergeVerb', () => {
  it('names the four GitHub states, merged and closed winning over draft', () => {
    expect(prState(pull({ state: 'open', isDraft: false }))).toBe('open');
    expect(prState(pull({ state: 'open', isDraft: true }))).toBe('draft');
    expect(prState(pull({ state: 'merged', isDraft: true }))).toBe('merged');
    expect(prState(pull({ state: 'closed', isDraft: true }))).toBe('closed');
  });

  it('keeps the review verdict in the hover sentence, not the pill', () => {
    expect(prStateDescription(pull({ reviewDecision: 'REVIEW_REQUIRED' }))).toBe('This pull request is open and needs a review.');
    expect(prStateDescription(pull({ reviewDecision: 'APPROVED' }))).toBe('This pull request is open and approved.');
    expect(prStateDescription(pull({ reviewDecision: 'CHANGES_REQUESTED' }))).toBe('This pull request is open — changes were requested.');
    expect(prStateDescription(pull({ reviewDecision: null }))).toBe('This pull request is open.');
    expect(prStateDescription(pull({ isDraft: true }))).toBe('This pull request is a draft — it is not ready for review yet.');
    expect(prStateDescription(pull({ state: 'merged' }))).toBe('This pull request is merged — there is nothing left to review.');
    expect(prStateDescription(pull({ state: 'closed' }))).toBe('This pull request is closed — there is nothing left to review.');
  });

  it('uses GitHub\'s byline verb per state', () => {
    expect(mergeVerb({ state: 'open' })).toBe('wants to merge');
    expect(mergeVerb({ state: 'merged' })).toBe('merged');
    expect(mergeVerb({ state: 'closed' })).toBe('wanted to merge');
  });
});
