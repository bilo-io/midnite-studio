import { describe, expect, it } from 'vitest';
import { preferredTargets, pathExportLine } from './cli-path';

describe('preferredTargets', () => {
  it('tries /usr/local/bin before the user-local fallback', () => {
    expect(preferredTargets('/Users/x')).toEqual([
      '/usr/local/bin/midnite-studio',
      '/Users/x/.local/bin/midnite-studio',
    ]);
  });
});

describe('pathExportLine', () => {
  it('emits the quoted export PATH= form', () => {
    expect(pathExportLine('/Users/x/.local/bin')).toBe('export PATH="/Users/x/.local/bin:$PATH"');
  });
});
