import { describe, expect, it, beforeEach } from 'vitest';

import type { TestRunResult } from '@midnite/git-shared';
import { activeRunId, useTestsStore } from './tests-store';

const okResult: TestRunResult = {
  ok: true,
  structured: true,
  exitCode: 0,
  passed: 3,
  failed: 0,
  skipped: 0,
  failures: [],
  output: '',
  truncated: false,
  ranAt: 1,
  durationMs: 10,
};

beforeEach(() => {
  useTestsStore.setState({ selectedSuite: {}, runs: {}, results: {} });
});

describe('tests-store', () => {
  it('selects a suite per repo independently', () => {
    const { selectSuite } = useTestsStore.getState();
    selectSuite('repo1', 'a::test');
    selectSuite('repo2', 'b::test');
    expect(useTestsStore.getState().selectedSuite).toEqual({ repo1: 'a::test', repo2: 'b::test' });
  });

  it('routes appended output to the suite that owns the run id', () => {
    const { startRun, appendOutput } = useTestsStore.getState();
    startRun('repo1', 'a::test', 'run-1');
    startRun('repo1', 'a::e2e', 'run-2');
    appendOutput('repo1', 'run-2', 'hello');
    const state = useTestsStore.getState();
    expect(state.runs['repo1']?.['a::test']?.output).toEqual([]);
    expect(state.runs['repo1']?.['a::e2e']?.output).toEqual(['hello']);
  });

  it('marks a run finished and stores its result', () => {
    const { startRun, finishRun } = useTestsStore.getState();
    startRun('repo1', 'a::test', 'run-1');
    finishRun('repo1', 'a::test', 'run-1', okResult);
    const state = useTestsStore.getState();
    expect(state.runs['repo1']?.['a::test']?.running).toBe(false);
    expect(state.results['repo1']?.['a::test']).toEqual(okResult);
    expect(activeRunId('repo1', 'a::test')).toBeNull();
  });

  it('ignores a stale result from a superseded run', () => {
    const { startRun, finishRun } = useTestsStore.getState();
    startRun('repo1', 'a::test', 'run-1');
    startRun('repo1', 'a::test', 'run-2'); // a re-run replaces the in-flight one
    finishRun('repo1', 'a::test', 'run-1', okResult); // the OLD run's result arrives late
    const state = useTestsStore.getState();
    expect(state.runs['repo1']?.['a::test']?.runId).toBe('run-2');
    expect(state.runs['repo1']?.['a::test']?.running).toBe(true);
    expect(state.results['repo1']?.['a::test']).toBeUndefined();
  });

  it('activeRunId is null once a run has finished', () => {
    const { startRun } = useTestsStore.getState();
    startRun('repo1', 'a::test', 'run-1');
    expect(activeRunId('repo1', 'a::test')).toBe('run-1');
  });
});
