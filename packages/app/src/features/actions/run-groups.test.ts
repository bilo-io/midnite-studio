import { ForgeRunSchema, type ForgeRun } from '@midnite/git-shared';
import { describe, expect, it } from 'vitest';

import {
  duration,
  groupRuns,
  isFailure,
  pickInitialRun,
  relativeAge,
  shouldExpandJob,
} from './run-groups';

/* Through the schema, so every field the contract grows arrives with its own
   default rather than having to be restated here. */
const run = (over: Partial<ForgeRun> & { id: string }): ForgeRun =>
  ForgeRunSchema.parse({
    name: 'CI',
    status: 'completed',
    conclusion: 'success',
    createdAt: '2026-08-26T10:00:00Z',
    url: `https://github.com/o/r/actions/runs/${over.id}`,
    ...over,
  });

describe('groupRuns', () => {
  it('groups on the workflow id, not its display name', () => {
    // A name is whatever `name:` says this morning. Grouping by it splits one
    // workflow's history the day somebody renames it.
    const groups = groupRuns([
      run({ id: '1', workflowId: '900', workflowName: 'CI', createdAt: '2026-08-01T00:00:00Z' }),
      run({
        id: '2',
        workflowId: '900',
        workflowName: 'CI (renamed)',
        createdAt: '2026-08-26T00:00:00Z',
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.runs.map((r) => r.id)).toEqual(['2', '1']);
    // The label comes from whichever run was seen first; the point is that a
    // rename did not create a second group.
    expect(groups[0]?.key).toBe('900');
  });

  it('keeps two same-named workflows apart', () => {
    const groups = groupRuns([
      run({ id: '1', workflowId: '900', workflowName: 'Build' }),
      run({ id: '2', workflowId: '901', workflowName: 'Build' }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('falls back to the name when the forge gave no workflow id', () => {
    // Pre-Theme-C cached payloads have no workflowId; they must still group.
    const groups = groupRuns([run({ id: '1', name: 'Legacy' }), run({ id: '2', name: 'Legacy' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe('Legacy');
  });

  it('orders groups by their own newest run', () => {
    const groups = groupRuns([
      run({ id: '1', workflowId: '900', workflowName: 'Old', createdAt: '2026-08-01T00:00:00Z' }),
      run({ id: '2', workflowId: '901', workflowName: 'New', createdAt: '2026-08-26T00:00:00Z' }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(['New', 'Old']);
  });

  it('sorts newest first inside a group', () => {
    const groups = groupRuns([
      run({ id: 'old', workflowId: '900', createdAt: '2026-08-01T00:00:00Z' }),
      run({ id: 'new', workflowId: '900', createdAt: '2026-08-26T00:00:00Z' }),
    ]);
    expect(groups[0]?.runs.map((r) => r.id)).toEqual(['new', 'old']);
  });

  it('has nothing to group when there are no runs', () => {
    expect(groupRuns([])).toEqual([]);
  });
});

describe('isFailure', () => {
  it('counts the three conclusions that mean somebody must look', () => {
    for (const conclusion of ['failure', 'startup_failure', 'timed_out'] as const) {
      expect(isFailure(run({ id: '1', conclusion }))).toBe(true);
    }
  });

  it('does not count a decision somebody made on purpose', () => {
    // Cancelled and skipped are choices, not faults. Opening the view on one of
    // those instead of the real failure two rows down is worse than nothing.
    for (const conclusion of ['cancelled', 'skipped', 'neutral', 'success'] as const) {
      expect(isFailure(run({ id: '1', conclusion }))).toBe(false);
    }
  });

  it('does not call an unfinished run a failure', () => {
    expect(isFailure(run({ id: '1', status: 'in_progress', conclusion: null }))).toBe(false);
    expect(isFailure(run({ id: '1', status: 'waiting', conclusion: null }))).toBe(false);
  });
});

describe('pickInitialRun', () => {
  it('opens on the newest failing run', () => {
    const chosen = pickInitialRun([
      run({ id: 'green-new', createdAt: '2026-08-26T12:00:00Z' }),
      run({ id: 'red-old', conclusion: 'failure', createdAt: '2026-08-26T09:00:00Z' }),
      run({ id: 'red-new', conclusion: 'failure', createdAt: '2026-08-26T11:00:00Z' }),
    ]);
    expect(chosen).toBe('red-new');
  });

  it('falls back to the newest run when everything passed', () => {
    // So a repository with CI never shows a blank pane.
    expect(
      pickInitialRun([
        run({ id: 'a', createdAt: '2026-08-01T00:00:00Z' }),
        run({ id: 'b', createdAt: '2026-08-26T00:00:00Z' }),
      ]),
    ).toBe('b');
  });

  it('is null only when there is nothing at all', () => {
    expect(pickInitialRun([])).toBeNull();
  });
});

describe('shouldExpandJob', () => {
  it('expands a failed job and nothing else', () => {
    expect(shouldExpandJob({ status: 'completed', conclusion: 'failure' })).toBe(true);
    expect(shouldExpandJob({ status: 'completed', conclusion: 'success' })).toBe(false);
    expect(shouldExpandJob({ status: 'completed', conclusion: 'skipped' })).toBe(false);
    expect(shouldExpandJob({ status: 'in_progress', conclusion: null })).toBe(false);
  });
});

describe('duration', () => {
  it('reads seconds, minutes and hours', () => {
    expect(duration('2026-08-26T10:00:00Z', '2026-08-26T10:00:42Z')).toBe('42s');
    expect(duration('2026-08-26T10:00:00Z', '2026-08-26T10:04:05Z')).toBe('4m 5s');
    expect(duration('2026-08-26T10:00:00Z', '2026-08-26T11:30:00Z')).toBe('1h 30m');
  });

  it('is null rather than 0s when an end is missing', () => {
    // A queued run has no start. "0s" would claim it ran instantly.
    expect(duration(null, '2026-08-26T10:00:00Z')).toBeNull();
    expect(duration('2026-08-26T10:00:00Z', null)).toBeNull();
  });

  it('is null for a negative or unparseable span', () => {
    expect(duration('2026-08-26T11:00:00Z', '2026-08-26T10:00:00Z')).toBeNull();
    expect(duration('not a date', '2026-08-26T10:00:00Z')).toBeNull();
  });
});

describe('relativeAge', () => {
  const now = Date.parse('2026-08-26T12:00:00Z');

  it('reads at the granularity the list is scanned at', () => {
    expect(relativeAge('2026-08-26T11:59:30Z', now)).toBe('just now');
    expect(relativeAge('2026-08-26T11:30:00Z', now)).toBe('30m ago');
    expect(relativeAge('2026-08-26T06:00:00Z', now)).toBe('6h ago');
    expect(relativeAge('2026-08-23T12:00:00Z', now)).toBe('3d ago');
  });

  it('does not go backwards for a clock that is slightly ahead', () => {
    expect(relativeAge('2026-08-26T12:00:05Z', now)).toBe('just now');
  });

  it('says nothing rather than NaN for an unparseable stamp', () => {
    expect(relativeAge('whenever', now)).toBe('');
  });
});
