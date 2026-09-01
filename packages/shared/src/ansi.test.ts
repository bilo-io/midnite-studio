import { describe, expect, it } from 'vitest';

import { collapseCarriageReturns, stripAnsi } from './ansi';

describe('stripAnsi', () => {
  it('strips a CSI color sequence', () => {
    expect(stripAnsi('\x1b[32mgreen\x1b[0m')).toBe('green');
  });

  it('strips an OSC sequence terminated by BEL', () => {
    expect(stripAnsi('\x1b]0;title\x07rest')).toBe('rest');
  });

  it('leaves plain text untouched', () => {
    expect(stripAnsi('plain text')).toBe('plain text');
  });
});

describe('collapseCarriageReturns', () => {
  it('keeps only the content after the last \\r on each line', () => {
    expect(collapseCarriageReturns('a\rb\rc')).toBe('c');
  });

  it('is a no-op on text with no carriage returns', () => {
    expect(collapseCarriageReturns('line one\nline two')).toBe('line one\nline two');
  });

  it('handles carriage returns independently per line', () => {
    expect(collapseCarriageReturns('x\ry\nfoo\rbar')).toBe('y\nbar');
  });
});
