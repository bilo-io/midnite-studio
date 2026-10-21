import type { MusicAgentProgressEvent } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { progressLabel, reduceProgress, startRun } from './run-progress';

const ev = (over: Partial<MusicAgentProgressEvent> = {}): MusicAgentProgressEvent => ({
  runId: 'r1',
  mode: 'iterative',
  state: 'running',
  pass: { n: 0, max: 8 },
  ...over,
});

describe('reduceProgress', () => {
  it('starts as "Starting" and counts the pass in flight', () => {
    const run = startRun('r1', 8);
    expect(progressLabel(run)).toBe('Starting');
    const first = reduceProgress(run, ev({ action: 'Added 12 notes' }))!;
    expect(progressLabel(first)).toBe('Pass 1 of 8');
    expect(first.action).toBe('Added 12 notes');
    const second = reduceProgress(first, ev({ pass: { n: 1, max: 8 }, action: 'Looked at the piano roll (pass 1 of 8)' }))!;
    expect(progressLabel(second)).toBe('Pass 2 of 8');
  });

  it('never goes backwards and keeps the last action when an event has none', () => {
    let run = reduceProgress(startRun('r1', 8), ev({ pass: { n: 3, max: 8 }, action: 'Saved the song' }))!;
    run = reduceProgress(run, ev({ pass: { n: 1, max: 8 } }))!;
    expect(run.pass).toBe(3);
    expect(run.action).toBe('Saved the song');
  });

  it('caps the label at the budget', () => {
    const run = reduceProgress(startRun('r1', 3), ev({ pass: { n: 9, max: 3 } }))!;
    expect(progressLabel(run)).toBe('Pass 3 of 3');
  });

  it('ignores another run and anything after a run settled', () => {
    const run = startRun('r1', 8);
    expect(reduceProgress(run, ev({ runId: 'other' }))).toBe(run);
    const done = reduceProgress(run, ev({ state: 'done' }))!;
    expect(reduceProgress(done, ev({ state: 'running', pass: { n: 5, max: 8 } }))).toBe(done);
    expect(reduceProgress(null, ev())).toBeNull();
  });

  it('shows the action alone for a single-pass engine', () => {
    const run = reduceProgress(startRun('r1', 8), ev({ mode: 'single-pass', action: 'Writing the song' }))!;
    expect(progressLabel(run)).toBe('Writing the song');
  });
});
