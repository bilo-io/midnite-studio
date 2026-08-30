import { describe, expect, it } from 'vitest';
import { downloadingState, notAvailableState } from './update-state';

describe('update-state', () => {
  it('clamps percent correctly', () => {
    expect(downloadingState({ percent: -5 }, '1.0.0').percent).toBe(0);
    expect(downloadingState({ percent: 140 }, '1.0.0').percent).toBe(100);
    expect(downloadingState({ percent: 41.6 }, '1.0.0').percent).toBe(42);
  });

  it('handles notAvailableState', () => {
    expect(notAvailableState()).toEqual({
      phase: 'idle',
      version: null,
      percent: null,
      error: null,
    });
  });
});
