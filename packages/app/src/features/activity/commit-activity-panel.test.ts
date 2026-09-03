import { describe, expect, it } from 'vitest';

import { emptyLabel } from './commit-activity-panel';

const envelope = (timeline: unknown) => ({ timeline });

describe('emptyLabel', () => {
  it('asks for a repository before anything else', () => {
    expect(emptyLabel({ repoId: null, settled: false, envelope: undefined, timeframe: 'week' })).toBe(
      'No repository',
    );
  });

  it('says the traversal is still running rather than claiming emptiness', () => {
    expect(emptyLabel({ repoId: 'r1', settled: false, envelope: undefined, timeframe: 'week' })).toBe(
      'Counting commits…',
    );
  });

  it('recognises an envelope from a pre-timeline main process', () => {
    expect(
      emptyLabel({
        repoId: 'r1',
        settled: true,
        envelope: envelope(undefined),
        timeframe: 'week',
      }),
    ).toBe('Engine updated — restart the app');
  });

  it('names the window it found empty, per timeframe', () => {
    for (const [timeframe, window] of [
      ['day', '24 hours'],
      ['week', '7 days'],
      ['month', '30 days'],
      ['year', '12 months'],
    ] as const) {
      expect(emptyLabel({ repoId: 'r1', settled: true, envelope: envelope([]), timeframe })).toBe(
        `No commits in the last ${window}`,
      );
    }
  });
});
