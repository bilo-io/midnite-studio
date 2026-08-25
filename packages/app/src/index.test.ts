import { describe, expect, it } from 'vitest';

import { APP_VERSION } from './index';

describe('app', () => {
  it('exposes a version', () => {
    expect(APP_VERSION).toBe('0.1.0');
  });
});
