import { describe, expect, it } from 'vitest';

import { DESKTOP_VERSION } from './index';

describe('desktop', () => {
  it('exposes a version', () => {
    expect(DESKTOP_VERSION).toBe('0.1.0');
  });
});
