import { describe, expect, it } from 'vitest';

import { cleanPtyText, collapseCarriageReturns, stripAnsi } from './ansi';

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

describe('stripAnsi — the sequences a TUI agent actually emits (Phase 79 Theme E)', () => {
  it('strips an OSC terminated by ESC-backslash, not only by BEL', () => {
    expect(stripAnsi('\x1b]0;title\x1b\\rest')).toBe('rest');
  });

  it('strips an OSC terminated by the 8-bit ST', () => {
    expect(stripAnsi('\x1b]0;title\u009Crest')).toBe('rest');
  });

  it('strips a DEC private mode set — the alternate screen and the hidden cursor', () => {
    expect(stripAnsi('\x1b[?1049h\x1b[?25lbody\x1b[?25h')).toBe('body');
  });

  it('strips cursor moves and erases', () => {
    expect(stripAnsi('\x1b[2K\x1b[1A\x1b[3;7Hhere')).toBe('here');
  });

  it('strips charset selection, which the old pattern left behind', () => {
    expect(stripAnsi('\x1b(Bplain')).toBe('plain');
  });

  it('strips a DCS payload whole', () => {
    expect(stripAnsi('\x1bP+q544e\u009Cafter')).toBe('after');
  });

  it('strips the 8-bit CSI form', () => {
    expect(stripAnsi('\u009B32mgreen\u009B0m')).toBe('green');
  });
});

describe('cleanPtyText', () => {
  it('does escapes, control bytes, redraws and padding in one pass', () => {
    const frame = '\x1b]0;t\x07\x1b[32mdrafting…\x1b[0m\rdone.   \n\x1b[?25hnext\u0007';
    expect(cleanPtyText(frame)).toBe('done.\nnext');
  });

  it('keeps tabs and newlines, which are layout rather than noise', () => {
    expect(cleanPtyText('a\tb\nc')).toBe('a\tb\nc');
  });

  it('strips a stray control byte a synthesiser would otherwise read', () => {
    expect(cleanPtyText('be\u0007ll')).toBe('bell');
  });
});
