import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ForgeRunSchema, type ForgeRun } from '@midnite/studio-shared';

import { RunListRow } from './forge-widgets';
import { runGlow } from './run-glow';

afterEach(cleanup);

function run(status: ForgeRun['status'], conclusion: ForgeRun['conclusion'] = null): ForgeRun {
  return ForgeRunSchema.parse({
    id: '1',
    name: 'CI',
    status,
    conclusion,
    headBranch: 'main',
    createdAt: '2026-09-30T10:00:00Z',
    url: 'https://github.com/o/r/actions/runs/1',
  });
}

describe('runGlow', () => {
  it.each([
    ['in_progress', null, 'running', true],
    ['queued', null, 'queued', false],
    ['requested', null, 'queued', false],
    ['pending', null, 'queued', false],
    ['waiting', null, 'waiting', false],
    ['completed', 'success', 'done', false],
    ['completed', 'failure', 'failed', false],
    ['completed', 'startup_failure', 'failed', false],
    ['completed', 'timed_out', 'failed', false],
    ['completed', 'action_required', 'waiting', false],
    ['completed', 'cancelled', 'idle', false],
    ['completed', 'skipped', 'idle', false],
    ['completed', 'neutral', 'idle', false],
    ['completed', 'stale', 'idle', false],
  ] as const)('%s/%s → %s (shimmer %s)', (status, conclusion, expected, shimmer) => {
    expect(runGlow(run(status, conclusion))).toEqual({ status: expected, shimmer });
  });
});

describe('RunListRow', () => {
  it('a running row wears the running glow and the shimmer', () => {
    render(
      <ul>
        <RunListRow run={run('in_progress')} onOpen={() => {}} />
      </ul>,
    );
    const li = screen.getByRole('listitem');
    expect(li.classList).toContain('activity-glow');
    expect(li.classList).toContain('run-glow');
    expect(li.dataset.activityStatus).toBe('running');
    expect(screen.getByTestId('run-shimmer').classList).toContain('pill-shimmer');
  });

  it.each([
    ['completed', 'success', 'done'],
    ['completed', 'failure', 'failed'],
    ['queued', null, 'queued'],
    ['completed', 'cancelled', 'idle'],
  ] as const)('a %s/%s row wears %s and no shimmer', (status, conclusion, expected) => {
    render(
      <ul>
        <RunListRow run={run(status, conclusion)} onOpen={() => {}} />
      </ul>,
    );
    expect(screen.getByRole('listitem').dataset.activityStatus).toBe(expected);
    expect(screen.queryByTestId('run-shimmer')).toBeNull();
  });
});
