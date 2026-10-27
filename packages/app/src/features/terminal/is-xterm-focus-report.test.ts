import { describe, expect, it } from 'vitest';

import { isXtermFocusReport, isXtermMouseReport, shouldWakeDeadPane } from './is-xterm-focus-report';

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

describe('isXtermMouseReport', () => {
  it('recognizes SGR motion, press and release reports', () => {
    expect(isXtermMouseReport('\x1b[<35;12;7M')).toBe(true); // any-motion hover
    expect(isXtermMouseReport('\x1b[<0;1;1M')).toBe(true); // press
    expect(isXtermMouseReport('\x1b[<0;120;48m')).toBe(true); // release
  });

  it('recognizes URXVT and X10/normal reports', () => {
    expect(isXtermMouseReport('\x1b[67;12;7M')).toBe(true);
    expect(isXtermMouseReport('\x1b[MC,\'')).toBe(true);
  });

  it('does not match keystrokes or other escape sequences', () => {
    expect(isXtermMouseReport('a')).toBe(false);
    expect(isXtermMouseReport('\r')).toBe(false);
    expect(isXtermMouseReport('\x1b[A')).toBe(false);
    expect(isXtermMouseReport('\x1b[I')).toBe(false);
    expect(isXtermMouseReport('foo\x1b[<35;1;1Mbar')).toBe(false);
  });
});

describe('shouldWakeDeadPane', () => {
  // The Loops-panel bug: a stopped loop's pane keeps its agent TUI's mouse
  // tracking, so hovering it fed SGR motion reports to the dead-pane wake path
  // and restarted the loop.
  it('does not wake a stopped pane on hover (mouse motion report)', () => {
    expect(shouldWakeDeadPane('\x1b[<35;40;10M')).toBe(false);
    expect(shouldWakeDeadPane('\x1b[<35;41;10M')).toBe(false);
  });

  it('does not wake on focus reports', () => {
    expect(shouldWakeDeadPane('\x1b[I')).toBe(false);
    expect(shouldWakeDeadPane('\x1b[O')).toBe(false);
  });

  it('wakes on a real keystroke or paste', () => {
    expect(shouldWakeDeadPane('a')).toBe(true);
    expect(shouldWakeDeadPane('\r')).toBe(true);
    expect(shouldWakeDeadPane('git status')).toBe(true);
  });
});
