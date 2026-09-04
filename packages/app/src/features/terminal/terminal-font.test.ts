import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  DEFAULT_TERMINAL_FONT_SIZE,
  DEFAULT_TERMINAL_LINE_HEIGHT,
  terminalFontOptions,
} from './terminal-font';

describe('terminalFontOptions', () => {
  it('returns every repo-owned default when nothing is set', () => {
    expect(terminalFontOptions({})).toEqual({
      fontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
      fontSize: DEFAULT_TERMINAL_FONT_SIZE,
      lineHeight: DEFAULT_TERMINAL_LINE_HEIGHT,
      letterSpacing: 0,
      fontWeight: 'normal',
      fontWeightBold: 'bold',
    });
  });

  it('treats a blank fontFamily the same as unset — the Settings field\'s "unset" state', () => {
    expect(terminalFontOptions({ fontFamily: '' }).fontFamily).toBe(DEFAULT_TERMINAL_FONT_FAMILY);
  });

  it('honours an explicit override of each field independently', () => {
    expect(terminalFontOptions({ fontFamily: 'Comic Mono' }).fontFamily).toBe('Comic Mono');
    expect(terminalFontOptions({ fontSize: 16 }).fontSize).toBe(16);
    expect(terminalFontOptions({ lineHeight: 1.4 }).lineHeight).toBe(1.4);
  });

  it('never carries undefined for a key xterm treats as "use the default" — every field is always resolved', () => {
    const options = terminalFontOptions({ fontFamily: 'X', fontSize: 14, lineHeight: 1.2 });
    for (const value of Object.values(options)) {
      expect(value).not.toBeUndefined();
    }
  });
});
