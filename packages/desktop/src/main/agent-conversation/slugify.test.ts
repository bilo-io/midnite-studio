import { describe, expect, it } from 'vitest';

import { slugifyCwd } from './slugify';

describe('slugifyCwd', () => {
  it('converts unix paths by replacing slashes with hyphens', () => {
    expect(slugifyCwd('/Users/bilolwabona/Dev/midnite-studio')).toBe(
      '-Users-bilolwabona-Dev-midnite-studio',
    );
  });

  it('converts dots and worktree paths to hyphens', () => {
    expect(
      slugifyCwd('/Users/bilolwabona/Dev/midnite-studio/.worktrees/adhoc-activity-no-commits'),
    ).toBe('-Users-bilolwabona-Dev-midnite-studio--worktrees-adhoc-activity-no-commits');
  });

  it('trims trailing slashes before slugifying', () => {
    expect(slugifyCwd('/Users/bilolwabona/Dev/midnite-studio/')).toBe(
      '-Users-bilolwabona-Dev-midnite-studio',
    );
    expect(slugifyCwd('/Users/bilolwabona/Dev/midnite-studio///')).toBe(
      '-Users-bilolwabona-Dev-midnite-studio',
    );
  });

  it('converts Windows paths with colons and backslashes to hyphens', () => {
    expect(slugifyCwd('C:\\Users\\bilolwabona\\Dev\\midnite-studio')).toBe(
      'C--Users-bilolwabona-Dev-midnite-studio',
    );
  });

  it('handles empty string', () => {
    expect(slugifyCwd('')).toBe('');
  });
});
