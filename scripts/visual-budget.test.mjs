import { describe, expect, it } from 'vitest';
import { checkVisualBudget, MAX_BASELINES, MAX_TOTAL_BYTES } from './visual-budget.mjs';

describe('checkVisualBudget', () => {
  it('passes on an empty corpus (before the first baseline ever lands)', () => {
    const result = checkVisualBudget([]);
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/OK/);
  });

  it('passes comfortably under both caps', () => {
    const sizes = Array(10).fill(15_000); // 10 baselines, ~15 KB each, well under the cap
    const result = checkVisualBudget(sizes);
    expect(result.ok).toBe(true);
  });

  it('fails when the baseline count exceeds the cap', () => {
    const sizes = Array(101).fill(1_000); // 101 tiny files — count breaches, size does not
    const result = checkVisualBudget(sizes, { maxCount: 100, maxTotalBytes: MAX_TOTAL_BYTES });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('101 baseline PNG(s) committed, over the cap of 100');
  });

  it('fails when the total size exceeds the cap even with few files', () => {
    const sizes = [4 * 1024 * 1024]; // one 4 MB baseline — e.g. an accidental full-page shot
    const result = checkVisualBudget(sizes, { maxCount: MAX_BASELINES, maxTotalBytes: 3 * 1024 * 1024 });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('4.00 MB of baselines committed, over the cap of 3.00 MB');
  });

  it('reports both breaches at once when both caps are exceeded', () => {
    const sizes = Array(150).fill(30_000); // 150 files x 30 KB = 4.5 MB — both caps breached
    const result = checkVisualBudget(sizes, { maxCount: 100, maxTotalBytes: 3 * 1024 * 1024 });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('150 baseline PNG(s) committed, over the cap of 100');
    expect(result.message).toContain('4.29 MB of baselines committed, over the cap of 3.00 MB');
  });

  it('the real caps match what Phase 82 Theme D settled on: ~100 baselines / 3 MB', () => {
    expect(MAX_BASELINES).toBe(100);
    expect(MAX_TOTAL_BYTES).toBe(3 * 1024 * 1024);
  });
});
