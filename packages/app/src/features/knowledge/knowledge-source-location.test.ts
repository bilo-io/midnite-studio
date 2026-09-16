// Layer: vitest — pure string parsing, no canvas needed.
import { describe, expect, it } from 'vitest';

import { parseSourceLocationLine } from './knowledge-source-location';

describe('parseSourceLocationLine', () => {
  it('parses a bare L<n>', () => {
    expect(parseSourceLocationLine('L35')).toBe(35);
    expect(parseSourceLocationLine('L1')).toBe(1);
    expect(parseSourceLocationLine('L2953')).toBe(2953);
  });

  it('returns null for anything not shaped like L<n>', () => {
    expect(parseSourceLocationLine('')).toBeNull();
    expect(parseSourceLocationLine('35')).toBeNull();
    expect(parseSourceLocationLine('L35-L40')).toBeNull();
    expect(parseSourceLocationLine('line 35')).toBeNull();
  });

  it('rejects L0 — line numbers are 1-based', () => {
    expect(parseSourceLocationLine('L0')).toBeNull();
  });
});
