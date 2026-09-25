import { describe, expect, it } from 'vitest';

import { parseWorkflowTestCounts } from './workflow-test-parsers';

describe('parseWorkflowTestCounts', () => {
  it('parses a vitest/jest json reporter fixture', () => {
    const fixture = JSON.stringify({
      numTotalTests: 4,
      numPassedTests: 2,
      numFailedTests: 1,
      numPendingTests: 1,
      testResults: [
        {
          name: 'src/a.test.ts',
          assertionResults: [
            { status: 'passed', fullName: 'a > passes' },
            {
              status: 'failed',
              fullName: 'a > fails',
              failureMessages: ['Error: expected 1 to be 2\n    at src/a.test.ts:10:1'],
            },
            { status: 'pending', fullName: 'a > skipped' },
          ],
        },
      ],
    });

    const result = parseWorkflowTestCounts('vitest', fixture);
    expect(result).toEqual({
      passed: 2,
      failed: 1,
      skipped: 1,
      failures: [{ name: 'a > fails', file: 'src/a.test.ts', message: 'Error: expected 1 to be 2' }],
    });
  });

  it('parses the identical shape under the "jest" parser key', () => {
    const fixture = JSON.stringify({
      testResults: [
        {
          name: 'b.test.ts',
          assertionResults: [{ status: 'passed', title: 'ok' }],
        },
      ],
    });
    expect(parseWorkflowTestCounts('jest', fixture)).toEqual({ passed: 1, failed: 0, skipped: 0, failures: [] });
  });

  it('parses a junit-xml fixture with a failure and a skip', () => {
    const fixture = `<?xml version="1.0"?>
<testsuites>
  <testsuite name="suite" tests="3" failures="1" errors="0" skipped="1">
    <testcase classname="pkg.A" name="passes" time="0.01"/>
    <testcase classname="pkg.A" name="fails" time="0.01">
      <failure message="expected true">stack trace line 1
stack trace line 2</failure>
    </testcase>
    <testcase classname="pkg.A" name="skipped" time="0.00">
      <skipped/>
    </testcase>
  </testsuite>
</testsuites>`;

    expect(parseWorkflowTestCounts('junit-xml', fixture)).toEqual({
      passed: 1,
      failed: 1,
      skipped: 1,
      failures: [{ name: 'fails', file: 'pkg.A', message: 'expected true' }],
    });
  });

  it('parses a junit-xml fixture whose failure has no message attribute', () => {
    const fixture = `<testsuite tests="1" failures="1">
  <testcase name="fails">
    <failure>boom
more detail</failure>
  </testcase>
</testsuite>`;
    expect(parseWorkflowTestCounts('junit-xml', fixture)).toEqual({
      passed: 0,
      failed: 1,
      skipped: 0,
      failures: [{ name: 'fails', file: null, message: 'boom' }],
    });
  });

  it('parses a tap fixture with a failure and a SKIP directive', () => {
    const fixture = `TAP version 13
1..4
ok 1 - adds numbers
not ok 2 - subtracts numbers
  ---
  message: 'expected -1 to be 1'
  ---
ok 3 - multiplies numbers # SKIP not implemented
not ok 4 - divides numbers # TODO fix rounding
`;
    expect(parseWorkflowTestCounts('tap', fixture)).toEqual({
      passed: 1,
      failed: 1,
      skipped: 2,
      failures: [{ name: 'subtracts numbers', file: null, message: 'subtracts numbers' }],
    });
  });

  it('returns null for output it does not recognise', () => {
    expect(parseWorkflowTestCounts('vitest', 'not json at all')).toBeNull();
    expect(parseWorkflowTestCounts('vitest', '')).toBeNull();
    expect(parseWorkflowTestCounts('junit-xml', 'no xml here')).toBeNull();
    expect(parseWorkflowTestCounts('tap', 'plain text with no tap lines')).toBeNull();
  });
});
