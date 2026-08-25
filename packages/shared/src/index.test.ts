import { describe, expect, it } from 'vitest';

import { SHARED_CONTRACT_VERSION } from './index';

describe('shared', () => {
  it('exposes a contract version', () => {
    expect(SHARED_CONTRACT_VERSION).toBe('0.1.0');
  });
});
