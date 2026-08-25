import { describe, expect, it } from 'vitest';

import { GIT_ENGINE_VERSION } from './index';

describe('git-engine', () => {
  it('exposes a version', () => {
    expect(GIT_ENGINE_VERSION).toBe('0.1.0');
  });
});
