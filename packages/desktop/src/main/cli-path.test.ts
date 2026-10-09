import { describe, expect, it } from 'vitest';
import { aliasTargetFor, preferredTargets, pathExportLine } from './cli-path';

describe('preferredTargets', () => {
  it('tries /usr/local/bin before the user-local fallback', () => {
    expect(preferredTargets('/Users/x')).toEqual([
      '/usr/local/bin/midnite',
      '/Users/x/.local/bin/midnite',
    ]);
  });
});

describe('aliasTargetFor', () => {
  it('puts the deprecated midnite-studio alias beside the primary target', () => {
    expect(aliasTargetFor('/usr/local/bin/midnite')).toBe('/usr/local/bin/midnite-studio');
    expect(aliasTargetFor('/Users/x/.local/bin/midnite')).toBe('/Users/x/.local/bin/midnite-studio');
  });
});

describe('pathExportLine', () => {
  it('emits the quoted export PATH= form', () => {
    expect(pathExportLine('/Users/x/.local/bin')).toBe('export PATH="/Users/x/.local/bin:$PATH"');
  });
});
