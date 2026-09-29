import { describe, expect, it } from 'vitest';

import { ForgeCommitRunsRequest } from '../ipc/schemas';
import { checksVerdict } from './checks-verdict';
import { aggregateCommitRuns, commitRunRank, CommitShaSchema, orderCommitRuns } from './commit-ci';
import { ForgeRunSchema, type ForgeRun } from './forge';

const SHA = 'a'.repeat(40);

const run = (over: Partial<ForgeRun> = {}): ForgeRun =>
  ForgeRunSchema.parse({
    id: '1',
    name: 'CI',
    status: 'completed',
    conclusion: 'success',
    headBranch: 'main',
    headSha: SHA,
    createdAt: '2026-08-26T10:00:00Z',
    url: 'https://github.com/o/r/actions/runs/1',
    ...over,
  });

describe('aggregateCommitRuns', () => {
  it('is null for a commit with no CI', () => {
    expect(aggregateCommitRuns(undefined)).toBeNull();
    expect(aggregateCommitRuns([])).toBeNull();
  });

  it('lets failure win over everything', () => {
    const ci = aggregateCommitRuns([
      run({ id: '1', name: 'lint', status: 'in_progress', conclusion: null }),
      run({ id: '2', name: 'test', conclusion: 'failure' }),
      run({ id: '3', name: 'build', conclusion: 'success' }),
    ]);
    expect(ci?.representative.id).toBe('2');
    expect(ci?.active).toBe(true);
    expect(ci?.runs.map((r) => r.id)).toEqual(['2', '1', '3']);
  });

  it('ranks running over queued over settled verdicts', () => {
    const ci = aggregateCommitRuns([
      run({ id: '1', name: 'a', status: 'queued', conclusion: null }),
      run({ id: '2', name: 'b', status: 'in_progress', conclusion: null }),
      run({ id: '3', name: 'c', conclusion: 'success' }),
    ]);
    expect(ci?.representative.id).toBe('2');
    expect(aggregateCommitRuns([run({ id: '1', name: 'a', status: 'queued', conclusion: null }), run({ id: '3', name: 'c' })])?.representative.id).toBe('1');
  });

  it('keeps green when a sibling workflow was cancelled or skipped', () => {
    const ci = aggregateCommitRuns([
      run({ id: '1', name: 'a', conclusion: 'cancelled' }),
      run({ id: '2', name: 'b', conclusion: 'success' }),
      run({ id: '3', name: 'c', conclusion: 'skipped' }),
    ]);
    expect(ci?.representative.conclusion).toBe('success');
    expect(ci?.active).toBe(false);
  });

  it('orders the non-green settled states cancelled > neutral > skipped', () => {
    expect(
      aggregateCommitRuns([
        run({ id: '1', name: 'a', conclusion: 'skipped' }),
        run({ id: '2', name: 'b', conclusion: 'neutral' }),
        run({ id: '3', name: 'c', conclusion: 'cancelled' }),
      ])?.representative.id,
    ).toBe('3');
    expect(
      aggregateCommitRuns([
        run({ id: '1', name: 'a', conclusion: 'skipped' }),
        run({ id: '2', name: 'b', conclusion: 'neutral' }),
      ])?.representative.id,
    ).toBe('2');
  });

  it('lets a re-run supersede the attempt it replaced — the checksVerdict rule', () => {
    const runs = [
      run({ id: '1', name: 'CI', conclusion: 'failure', createdAt: '2026-08-26T10:00:00Z' }),
      run({ id: '2', name: 'CI', conclusion: 'success', createdAt: '2026-08-26T11:00:00Z' }),
    ];
    const ci = aggregateCommitRuns(runs);
    expect(ci?.representative.id).toBe('2');
    expect(ci?.runs).toHaveLength(1);
    // The two readings agree: green column, green verdict.
    expect(checksVerdict(runs, SHA)?.level).toBe('ok');
  });

  it('agrees with checksVerdict on the three levels it shares', () => {
    const failing = [run({ name: 'a', conclusion: 'failure' }), run({ name: 'b', status: 'in_progress', conclusion: null })];
    expect(checksVerdict(failing, SHA)?.level).toBe('fail');
    expect(commitRunRank(aggregateCommitRuns(failing)!.representative)).toBe(0);

    const running = [run({ name: 'a' }), run({ name: 'b', status: 'in_progress', conclusion: null })];
    expect(checksVerdict(running, SHA)?.level).toBe('warn');
    expect(aggregateCommitRuns(running)?.representative.status).toBe('in_progress');
  });
});

describe('orderCommitRuns', () => {
  it('breaks precedence ties newest first', () => {
    const ordered = orderCommitRuns([
      run({ id: 'old', name: 'a', conclusion: 'failure', createdAt: '2026-08-26T09:00:00Z' }),
      run({ id: 'new', name: 'b', conclusion: 'timed_out', createdAt: '2026-08-26T12:00:00Z' }),
    ]);
    expect(ordered.map((r) => r.id)).toEqual(['new', 'old']);
  });
});

describe('ForgeCommitRunsRequest', () => {
  it('takes full shas only, bounded', () => {
    expect(CommitShaSchema.safeParse(SHA).success).toBe(true);
    expect(CommitShaSchema.safeParse('b'.repeat(64)).success).toBe(true);
    expect(CommitShaSchema.safeParse('abc1234').success).toBe(false);
    expect(CommitShaSchema.safeParse(`${SHA}; rm -rf /`).success).toBe(false);
    expect(ForgeCommitRunsRequest.safeParse({ repoId: 'r', shas: [] }).success).toBe(false);
    expect(
      ForgeCommitRunsRequest.safeParse({ repoId: 'r', shas: Array.from({ length: 51 }, () => SHA) }).success,
    ).toBe(false);
  });
});
