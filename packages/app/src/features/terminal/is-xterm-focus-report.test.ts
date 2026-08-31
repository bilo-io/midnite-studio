import { describe, expect, it } from 'vitest';

import { isXtermFocusReport } from './is-xterm-focus-report';

describe('isXtermFocusReport', () => {
  it('recognizes the focus-in report', () => {
    expect(isXtermFocusReport('\x1b[I')).toBe(true);
  });

  it('recognizes the focus-out report', () => {
    expect(isXtermFocusReport('\x1b[O')).toBe(true);
  });

  it('does not match ordinary keystrokes', () => {
    expect(isXtermFocusReport('a')).toBe(false);
    expect(isXtermFocusReport('\r')).toBe(false);
  });

  it('does not match other escape sequences', () => {
    expect(isXtermFocusReport('\x1b[A')).toBe(false); // arrow up
    expect(isXtermFocusReport('\x1bOA')).toBe(false); // application-cursor arrow up
  });

  it('does not match a pasted chunk that happens to contain the bytes mid-string', () => {
    expect(isXtermFocusReport('foo\x1b[Ibar')).toBe(false);
  });
});
