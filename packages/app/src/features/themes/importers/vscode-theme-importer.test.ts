import { describe, expect, it } from 'vitest';

// `?raw` (Vite), not `node:fs` — the renderer's eslint boundary forbids node
// builtins under `src/` (see `icon-names.test.ts`'s own comment on the same
// constraint); this reads each fixture's exact text at transform time.
import arrayScopesJson from './__fixtures__/array-scopes.json?raw';
import eightDigitHexJson from './__fixtures__/eight-digit-hex.json?raw';
import noTypeJson from './__fixtures__/no-type.json?raw';

import { isHslTriplet } from '../theme-types';
import { hexToHslTriplet, importVsCodeTheme } from './vscode-theme-importer';

describe('importVsCodeTheme', () => {
  it('imports a theme whose tokenColors use array-form scopes', () => {
    const result = importVsCodeTheme(arrayScopesJson);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.palette.appearance).toBe('dark');
    expect(result.palette.label).toBe('Array Scopes Test Theme');
    // Two scopes on the "Comments" entry and three on "Strings and constants"
    // must each become their OWN rule — a naive importer that keeps the array
    // as one `token` string renders every one of these scopes grey.
    const commentRules = result.palette.editor.rules.filter((r) =>
      ['comment', 'punctuation.definition.comment'].includes(r.token),
    );
    expect(commentRules).toHaveLength(2);
    expect(commentRules.every((r) => r.foreground === '6c7086')).toBe(true);
    const stringRules = result.palette.editor.rules.filter((r) =>
      ['string', 'constant.numeric', 'constant.language'].includes(r.token),
    );
    expect(stringRules).toHaveLength(3);
    // A bare (non-array) scope string still becomes exactly one rule.
    expect(result.palette.editor.rules.some((r) => r.token === 'keyword.control')).toBe(true);
  });

  it('imports a theme with no `type` field, defaulting to dark', () => {
    const result = importVsCodeTheme(noTypeJson);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.palette.appearance).toBe('dark');
    expect(result.palette.editor.base).toBe('vs-dark');
    expect(result.palette.highlight).toBe('github-dark');
  });

  it('imports a theme with 8-digit hex colours, dropping the alpha channel', () => {
    const result = importVsCodeTheme(eightDigitHexJson);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.palette.appearance).toBe('light');
    // Every chrome value must still parse as a bare HSL triplet — the 8th and
    // 9th hex digits (alpha) must never leak into the tailwind-consumed value.
    for (const value of Object.values(result.palette.chrome)) {
      expect(isHslTriplet(value as string)).toBe(true);
    }
    const rule = result.palette.editor.rules.find((r) => r.token === 'entity.name.function');
    expect(rule?.foreground).toBe('8250df');
  });

  it('rejects malformed JSON with a distinct reason', () => {
    const result = importVsCodeTheme('{ this is not json');
    expect(result).toEqual({ ok: false, reason: 'Malformed JSON' });
  });

  it('rejects a file over 2 MB with a distinct reason', () => {
    const huge = JSON.stringify({
      name: 'Huge',
      type: 'dark',
      colors: { 'editor.background': '#000000' },
      tokenColors: [],
      padding: 'x'.repeat(3 * 1024 * 1024),
    });
    const result = importVsCodeTheme(huge);
    expect(result).toEqual({ ok: false, reason: 'File too large (over 2 MB)' });
  });

  it('rejects an empty object with a distinct reason', () => {
    const result = importVsCodeTheme('{}');
    expect(result).toEqual({
      ok: false,
      reason: 'Empty theme: no colors or tokenColors found',
    });
  });

  it('rejects a non-object JSON value', () => {
    const result = importVsCodeTheme('"just a string"');
    expect(result.ok).toBe(false);
  });

  it('every generated ANSI/terminal colour and chrome token is present and valid', () => {
    const result = importVsCodeTheme(arrayScopesJson);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const key of [
      'black',
      'red',
      'green',
      'yellow',
      'blue',
      'magenta',
      'cyan',
      'white',
      'brightBlack',
      'brightRed',
      'brightGreen',
      'brightYellow',
      'brightBlue',
      'brightMagenta',
      'brightCyan',
      'brightWhite',
    ] as const) {
      expect(result.palette.terminal[key]).toBeTruthy();
    }
  });
});

describe('hexToHslTriplet', () => {
  it('converts a plain 6-digit hex', () => {
    const hsl = hexToHslTriplet('#1e1e2e');
    expect(hsl).toBeDefined();
    expect(isHslTriplet(hsl!)).toBe(true);
  });

  it('converts 3-digit shorthand hex', () => {
    const hsl = hexToHslTriplet('#fff');
    expect(hsl).toBe('0 0% 100%');
  });

  it('drops the alpha channel on 8-digit hex', () => {
    const withAlpha = hexToHslTriplet('#ffffffff');
    const without = hexToHslTriplet('#ffffff');
    expect(withAlpha).toBe(without);
  });

  it('returns undefined for a non-hex value', () => {
    expect(hexToHslTriplet('not-a-color')).toBeUndefined();
    expect(hexToHslTriplet(undefined)).toBeUndefined();
  });
});
