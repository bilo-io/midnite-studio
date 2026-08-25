import { describe, expect, it } from 'vitest';

import { validateRefName } from './prompt-dialog';

/**
 * The rules are git's own (`git check-ref-format`). Validating here means the
 * user finds out while typing rather than after the dialog closes and the
 * operation fails.
 */
describe('validateRefName', () => {
  it('accepts ordinary branch names', () => {
    for (const name of ['main', 'feature/thing', 'fix-123', 'release/v1.2.0', 'user/x_y']) {
      expect(validateRefName(name)).toBeNull();
    }
  });

  it('rejects spaces', () => {
    expect(validateRefName('my branch')).toMatch(/spaces/i);
  });

  it('rejects the characters git forbids', () => {
    for (const name of ['a~b', 'a^b', 'a:b', 'a?b', 'a*b', 'a[b', 'a\\b']) {
      expect(validateRefName(name)).toBeTruthy();
    }
  });

  it('rejects a double dot', () => {
    expect(validateRefName('a..b')).toMatch(/\.\./);
  });

  it('rejects leading and trailing separators', () => {
    expect(validateRefName('/leading')).toBeTruthy();
    expect(validateRefName('trailing/')).toBeTruthy();
    expect(validateRefName('.hidden')).toBeTruthy();
    expect(validateRefName('trailing.')).toBeTruthy();
  });

  it('rejects a .lock suffix', () => {
    // git uses `<ref>.lock` files internally, so this name can never exist.
    expect(validateRefName('branch.lock')).toMatch(/\.lock/);
  });

  it('rejects a doubled slash', () => {
    expect(validateRefName('a//b')).toBeTruthy();
  });
});
