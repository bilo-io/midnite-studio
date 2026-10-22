// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { devToolsAllowed } from './devtools';

describe('devToolsAllowed', () => {
  it('allows DevTools in dev', () => {
    expect(devToolsAllowed(false, {})).toBe(true);
  });
  it('denies DevTools in a packaged build', () => {
    expect(devToolsAllowed(true, {})).toBe(false);
  });
  it('lets MSTUDIO_DEVTOOLS=1 re-open the door in a packaged build', () => {
    expect(devToolsAllowed(true, { MSTUDIO_DEVTOOLS: '1' })).toBe(true);
    expect(devToolsAllowed(true, { MSTUDIO_DEVTOOLS: '0' })).toBe(false);
  });
});
