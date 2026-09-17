import { describe, expect, it } from 'vitest';
import { checkE2eBudget, MAX_DECLARED_E2E } from './e2e-budget.mjs';

describe('checkE2eBudget', () => {
  it('passes when declared count and visual budget are within limits', () => {
    const result = checkE2eBudget({
      declaredCount: 433,
      visualSizes: [15_000, 20_000],
      unitTimingViolations: [],
    });
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/e2e-budget OK: 433 declared E2E test\(s\)/);
  });

  it('fails when declared functional test count exceeds the ratchet cap', () => {
    const result = checkE2eBudget(
      { declaredCount: 434, visualSizes: [], unitTimingViolations: [] },
      { maxDeclaredE2e: 433 },
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain('434 functional E2E tests declared, over the committed ratchet cap of 433');
    expect(result.message).toContain('A new test belongs in Vitest unless it requires a real browser capability');
  });

  it('fails when visual budget is exceeded', () => {
    const hugeSizes = [4 * 1024 * 1024]; // 4 MB > 3 MB cap
    const result = checkE2eBudget({
      declaredCount: 100,
      visualSizes: hugeSizes,
      unitTimingViolations: [],
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('visual-budget FAILED');
  });

  it('fails when unit timing violations are present', () => {
    const result = checkE2eBudget({
      declaredCount: 100,
      visualSizes: [],
      unitTimingViolations: [
        {
          file: 'packages/desktop/src/example.test.ts',
          line: 42,
          lineContent: 'expect(elapsed).toBeLessThan(50);',
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Found 1 wall-clock duration assertion(s) in unit tests');
    expect(result.message).toContain('packages/desktop/src/example.test.ts:42 -> expect(elapsed).toBeLessThan(50);');
    expect(result.message).toContain('Unit tests must not assert wall-clock durations');
  });

  it('reports multiple budget breaches simultaneously', () => {
    const result = checkE2eBudget(
      {
        declaredCount: 500,
        visualSizes: [4 * 1024 * 1024],
        unitTimingViolations: [
          {
            file: 'foo.test.ts',
            line: 10,
            lineContent: 'expect(Date.now() - t0).toBeLessThan(100);',
          },
        ],
      },
      { maxDeclaredE2e: 433 },
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain('500 functional E2E tests declared, over the committed ratchet cap of 433');
    expect(result.message).toContain('visual-budget FAILED');
    expect(result.message).toContain('Found 1 wall-clock duration assertion(s)');
  });

  it('the committed ratchet cap matches its own committed value (438 -> 439, apps rail switcher reveal, PR #434)', () => {
    expect(MAX_DECLARED_E2E).toBe(439);
  });
});
