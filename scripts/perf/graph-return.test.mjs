// vitest, plain node: the pure summarise/budget logic of memory-report.mjs --graph-return
// (Phase 84 G.5). No Electron, no wall-clock assertions.
import { describe, expect, it } from 'vitest';
import { checkGraphReturnBudget, summarizeGraphReturn } from './memory-report.mjs';

describe('summarizeGraphReturn', () => {
  it('takes the median of an odd count', () => {
    const s = summarizeGraphReturn({ warmMs: [50, 10, 30], coldMs: [900, 700, 800, 1000, 600] });
    expect(s.warmMedianMs).toBe(30);
    expect(s.coldMedianMs).toBe(800);
  });
  it('takes the mean of the middle two for an even count', () => {
    const s = summarizeGraphReturn({ warmMs: [10, 20, 30, 40], coldMs: [100, 200] });
    expect(s.warmMedianMs).toBe(25);
    expect(s.coldMedianMs).toBe(150);
  });
  it('reports speedup as cold/warm to one decimal', () => {
    expect(summarizeGraphReturn({ warmMs: [30], coldMs: [100] }).speedup).toBe(3.3);
    expect(summarizeGraphReturn({ warmMs: [40], coldMs: [100] }).speedup).toBe(2.5);
  });
  it('throws on empty samples', () => {
    expect(() => summarizeGraphReturn({ warmMs: [], coldMs: [1] })).toThrow(
      'summarizeGraphReturn: empty samples',
    );
    expect(() => summarizeGraphReturn({ warmMs: [1], coldMs: [] })).toThrow(
      'summarizeGraphReturn: empty samples',
    );
  });
});

describe('checkGraphReturnBudget', () => {
  it('is 0 within budget, 1 over, 2 when unset', () => {
    expect(checkGraphReturnBudget(100, 100)).toBe(0);
    expect(checkGraphReturnBudget(101, 100)).toBe(1);
    expect(checkGraphReturnBudget(100, undefined)).toBe(2);
  });
});
