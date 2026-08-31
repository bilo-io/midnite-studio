import { describe, expect, it } from 'vitest';

import { CASCADE_MAX_STEPS, CASCADE_STEP_MS, cascadeStyle } from './cascade';

describe('cascade', () => {
  it('caps index to CASCADE_MAX_STEPS in custom property', () => {
    expect(cascadeStyle(0)).toEqual({ '--i': 0 });
    expect(cascadeStyle(5)).toEqual({ '--i': 5 });
    expect(cascadeStyle(CASCADE_MAX_STEPS)).toEqual({ '--i': CASCADE_MAX_STEPS });
    expect(cascadeStyle(CASCADE_MAX_STEPS + 10)).toEqual({ '--i': CASCADE_MAX_STEPS });
    expect(cascadeStyle(18, 20)).toEqual({ '--i': 18 });
    expect(cascadeStyle(25, 20)).toEqual({ '--i': 20 });
  });

  it('defines step duration constant', () => {
    expect(CASCADE_STEP_MS).toBe(18);
  });
});
