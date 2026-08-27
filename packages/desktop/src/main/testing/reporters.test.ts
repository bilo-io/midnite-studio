import { describe, expect, it } from 'vitest';

import { parseStructuredResult } from './reporters';

describe('parseStructuredResult — vitest/jest-shaped JSON', () => {
  it('reads suite-level totals and per-assertion failures', () => {
    const json = JSON.stringify({
      numTotalTests: 3,
      numPassedTests: 1,
      numFailedTests: 1,
      numPendingTests: 1,
      testResults: [
        {
          name: '/repo/src/a.test.ts',
          assertionResults: [
            { status: 'passed', fullName: 'a > works' },
            { status: 'failed', fullName: 'a > breaks', failureMessages: ['Expected 1 to be 2\n  at x'] },
            { status: 'pending', fullName: 'a > later' },
          ],
        },
      ],
    });

    const result = parseStructuredResult(json);
    expect(result).toEqual({
      passed: 1,
      failed: 1,
      skipped: 1,
      failures: [{ name: 'a > breaks', file: '/repo/src/a.test.ts', message: 'Expected 1 to be 2' }],
    });
  });
});

describe('parseStructuredResult — playwright-shaped JSON', () => {
  it('reads stats and walks nested suites for failures', () => {
    const json = JSON.stringify({
      stats: { expected: 2, unexpected: 1, skipped: 0, flaky: 0 },
      suites: [
        {
          title: 'root',
          specs: [
            {
              title: 'logs in',
              file: 'e2e/login.spec.ts',
              tests: [{ results: [{ status: 'failed', error: { message: 'Timed out\nmore' } }] }],
            },
          ],
          suites: [],
        },
      ],
    });

    const result = parseStructuredResult(json);
    expect(result).toEqual({
      passed: 2,
      failed: 1,
      skipped: 0,
      failures: [{ name: 'logs in', file: 'e2e/login.spec.ts', message: 'Timed out' }],
    });
  });
});

describe('parseStructuredResult — unrecognised output', () => {
  it('returns null for non-JSON output', () => {
    expect(parseStructuredResult('PASS src/a.test.ts\n1 passed')).toBeNull();
  });

  it('returns null for JSON that matches neither known shape', () => {
    expect(parseStructuredResult(JSON.stringify({ ok: true }))).toBeNull();
  });

  it('returns null for empty output', () => {
    expect(parseStructuredResult('')).toBeNull();
    expect(parseStructuredResult('   ')).toBeNull();
  });
});
