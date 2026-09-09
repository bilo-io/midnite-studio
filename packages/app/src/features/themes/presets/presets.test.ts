import { describe, expect, it } from 'vitest';

import { BUILTIN_PALETTES } from './index';
import { ANSI_KEYS } from '../theme-types';

describe('BUILTIN_PALETTES balance', () => {
  it('is exactly 6 light + 6 dark', () => {
    const dark = BUILTIN_PALETTES.filter((p) => p.appearance === 'dark');
    const light = BUILTIN_PALETTES.filter((p) => p.appearance === 'light');
    expect(dark).toHaveLength(6);
    expect(light).toHaveLength(6);
    expect(BUILTIN_PALETTES).toHaveLength(12);
  });
});

/** The five base `ITheme` keys every terminal must set, beyond the 16 ANSI
 * colours — a partial theme here is what makes a terminal look broken under
 * a light palette specifically, since xterm's own defaults assume a dark
 * background. */
const TERMINAL_BASE_KEYS = [
  'background',
  'foreground',
  'cursor',
  'cursorAccent',
  'selectionBackground',
] as const;

describe('every BUILTIN_PALETTE has a complete terminal ITheme', () => {
  for (const palette of BUILTIN_PALETTES) {
    it(`${palette.id} sets all 16 ANSI keys and the 5 base keys`, () => {
      for (const key of ANSI_KEYS) {
        expect(palette.terminal[key], `${palette.id}.terminal.${key}`).toBeTruthy();
      }
      for (const key of TERMINAL_BASE_KEYS) {
        expect(palette.terminal[key], `${palette.id}.terminal.${key}`).toBeTruthy();
      }
    });
  }
});
