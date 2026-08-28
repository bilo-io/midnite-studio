import type { TestRunResult } from '@midnite/git-shared';
import { describe, expect, it } from 'vitest';

import { testVerdict } from './test-verdict';

const pass = (overrides: Partial<Extract<TestRunResult, { ok: true }>> = {}): TestRunResult => ({
  ok: true,
  structured: true,
  exitCode: 0,
  passed: 3,
  failed: 0,
  skipped: 0,
  failures: [],
  output: '',
  truncated: false,
  ranAt: 0,
  durationMs: 0,
  ...overrides,
});

const fail = (failed: number): TestRunResult => pass({ failed, passed: 1 });

const notRun = (): TestRunResult => ({ ok: false, reason: 'not-installed', hint: '' });

describe('testVerdict', () => {
  it('renders nothing when no results exist yet', () => {
    expect(testVerdict(undefined)).toBeNull();
    expect(testVerdict({})).toBeNull();
  });

  it('renders nothing when every suite could not run at all', () => {
    expect(testVerdict({ unit: notRun(), e2e: notRun() })).toBeNull();
  });

  it('fails when any suite that ran has failures', () => {
    expect(testVerdict({ unit: pass(), e2e: fail(1) })).toEqual({
      label: '1 failing',
      failing: true,
    });
  });

  it('sums failing suites, not failing tests', () => {
    expect(testVerdict({ unit: fail(3), e2e: fail(1) })).toEqual({
      label: '2 failing',
      failing: true,
    });
  });

  it('passes when every suite that ran is clean, ignoring suites that could not run', () => {
    expect(testVerdict({ unit: pass(), e2e: pass(), broken: notRun() })).toEqual({
      label: '2 suites passing',
      failing: false,
    });
  });
});
