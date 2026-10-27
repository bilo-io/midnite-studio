import { describe, expect, it } from 'vitest';

import { policyHookScriptPath } from './policy-hook-path';

describe('policyHookScriptPath', () => {
  it('returns a path ending with policy-hook.js and points outside asar', () => {
    const path = policyHookScriptPath();
    expect(path).toMatch(/policy-hook\.js$/);
    expect(path).not.toMatch(/app\.asar\//);
  });
});
