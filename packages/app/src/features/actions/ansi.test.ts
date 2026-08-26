import { describe, expect, it } from 'vitest';

import { parseAnsi, stripAnsi } from './ansi';

/* Written as a variable rather than inline so the test source has no literal
   control characters in it — the same reason ansi.ts builds its regexes. */
const ESC = String.fromCharCode(27);
const sgr = (params: string) => `${ESC}[${params}m`;

describe('parseAnsi', () => {
  it('returns one unstyled span for plain text', () => {
    expect(parseAnsi('all good')).toEqual([{ text: 'all good', className: '' }]);
  });

  it('colours the span a code opens, and stops at the reset', () => {
    const spans = parseAnsi(`ok ${sgr('31')}FAIL${sgr('0')} done`);
    expect(spans.map((span) => span.text)).toEqual(['ok ', 'FAIL', ' done']);
    expect(spans[0]?.className).toBe('');
    expect(spans[1]?.className).toContain('text-red-600');
    // Theme-aware, not a literal — a terminal's red is unreadable on this ground.
    expect(spans[1]?.className).toContain('dark:text-red-400');
    expect(spans[2]?.className).toBe('');
  });

  it('reads a compound parameter list', () => {
    const [span] = parseAnsi(`${sgr('1;32')}PASS`);
    expect(span?.className).toContain('text-emerald-600');
    expect(span?.className).toContain('font-semibold');
  });

  it('treats an empty parameter list as a reset', () => {
    // `ESC[m` is legal and means `ESC[0m`.
    const spans = parseAnsi(`${sgr('31')}red${sgr('')}plain`);
    expect(spans[1]?.className).toBe('');
  });

  it('turns bold off with 22 without losing the colour', () => {
    const spans = parseAnsi(`${sgr('1;31')}bold${sgr('22')}thin`);
    expect(spans[0]?.className).toContain('font-semibold');
    expect(spans[1]?.className).toContain('text-red-600');
    expect(spans[1]?.className).not.toContain('font-semibold');
  });

  it('swallows an extended-colour sequence instead of misreading its arguments', () => {
    // `38;5;196` is "palette index 196". Reading 5 and 196 as codes would leave
    // the rest of the line painted at random.
    const spans = parseAnsi(`${sgr('38;5;196')}text`);
    expect(spans).toHaveLength(1);
    expect(spans[0]?.text).toBe('text');
    expect(spans[0]?.className).toBe('');
  });

  it('swallows a truecolour sequence too', () => {
    const spans = parseAnsi(`${sgr('38;2;255;0;0')}text`);
    expect(spans[0]?.text).toBe('text');
    expect(spans[0]?.className).toBe('');
  });

  it('drops cursor and erase sequences rather than printing them', () => {
    // An unhandled escape rendered literally is worse than an uncoloured one.
    expect(stripAnsi(`${ESC}[2Kcleared${ESC}[1A`)).toBe('cleared');
  });

  it('drops an OSC hyperlink wrapper, keeping its text', () => {
    const BEL = String.fromCharCode(7);
    const line = `${ESC}]8;;https://example.com${BEL}link${ESC}]8;;${BEL}`;
    expect(stripAnsi(line)).toBe('link');
  });

  it('shows only the last pass of a progress bar', () => {
    // One npm install writes its whole history into a single line; a terminal
    // shows the last one, and rendering all forty would be forty columns of bar.
    expect(stripAnsi('[=>    ]\r[====> ]\r[======]')).toBe('[======]');
  });

  it('is unbothered by the trailing carriage return of CRLF', () => {
    expect(stripAnsi('done\r')).toBe('done');
  });

  it('never resolves to nothing for a line that had text', () => {
    // Belt-and-braces: a log row that renders empty reads as a lost line.
    for (const line of ['x', ` ${sgr('31')} `, `${sgr('0')}y`]) {
      expect(stripAnsi(line).length).toBeGreaterThan(0);
    }
  });
});

describe('the review’s findings, kept fixed', () => {
  it('drops a cursor hide/show, which every CI spinner emits', () => {
    // `ESC[?25l` carries a PRIVATE parameter byte. A parameter class of
    // `[0-9;]` does not match it, so it survived into the row and rendered as
    // a literal `[?25l` — the exact outcome this module exists to prevent.
    const line = `${ESC}[?25l${sgr('36')}installing${sgr('39')}${ESC}[?25h`;
    expect(stripAnsi(line)).toBe('installing');
    expect(stripAnsi(line)).not.toContain('[?25');
  });

  it('does not read a private SGR-shaped sequence as a style', () => {
    // `ESC[>4;2m` ends in `m` but its parameters are not an SGR list; treating
    // them as codes would paint the rest of the line at random.
    const spans = parseAnsi(`${ESC}[>4;2mplain`);
    expect(spans).toHaveLength(1);
    expect(spans[0]?.text).toBe('plain');
    expect(spans[0]?.className).toBe('');
  });
});
