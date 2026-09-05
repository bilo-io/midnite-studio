import { describe, expect, it } from 'vitest';

import { BUILTIN_PALETTES, DEFAULT_PALETTE_ID } from './presets';
import { ANSI_KEYS, isHslTriplet, STUDIO_TOKENS } from './theme-types';

describe('BUILTIN_PALETTES', () => {
  it('has a preset for DEFAULT_PALETTE_ID', () => {
    expect(BUILTIN_PALETTES.some((p) => p.id === DEFAULT_PALETTE_ID)).toBe(true);
  });

  it('has six distinct ids', () => {
    const ids = BUILTIN_PALETTES.map((p) => p.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
  });

  for (const palette of BUILTIN_PALETTES) {
    describe(palette.id, () => {
      it('every chrome value parses as an HSL triplet', () => {
        for (const [token, value] of Object.entries(palette.chrome)) {
          expect(isHslTriplet(value as string), `${palette.id}.chrome['${token}'] = ${value}`).toBe(
            true,
          );
        }
      });

      it('never sets --radius (it is a length, not a colour)', () => {
        expect(palette.chrome['--radius']).toBeUndefined();
      });

      it('only sets known StudioTokens', () => {
        for (const token of Object.keys(palette.chrome)) {
          expect(STUDIO_TOKENS).toContain(token);
        }
      });

      it('defines all 16 ANSI keys', () => {
        for (const key of ANSI_KEYS) {
          expect(palette.terminal[key], `${palette.id}.terminal.${key}`).toBeTruthy();
        }
      });

      it('declares an appearance of dark or light', () => {
        expect(['dark', 'light']).toContain(palette.appearance);
      });

      it('has a non-empty editor theme', () => {
        expect(['vs', 'vs-dark', 'hc-black']).toContain(palette.editor.base);
        expect(palette.editor.rules.length).toBeGreaterThan(0);
        expect(Object.keys(palette.editor.colors).length).toBeGreaterThan(0);
      });

      it('has a highlight theme id', () => {
        expect(typeof palette.highlight).toBe('string');
        expect(palette.highlight.length).toBeGreaterThan(0);
      });
    });
  }

  it('github-dark and github-light are the migration baseline — byte-identical to @bilo-io/ui/dist/tokens.css', () => {
    const dark = BUILTIN_PALETTES.find((p) => p.id === 'github-dark')!;
    const light = BUILTIN_PALETTES.find((p) => p.id === 'github-light')!;
    expect(dark.chrome['--background']).toBe('240 10% 3.9%');
    expect(dark.chrome['--foreground']).toBe('0 0% 98%');
    expect(light.chrome['--background']).toBe('0 0% 100%');
    expect(light.chrome['--foreground']).toBe('240 10% 3.9%');
  });
});

describe('isHslTriplet', () => {
  it('accepts a bare HSL triplet', () => {
    expect(isHslTriplet('240 6% 10%')).toBe(true);
    expect(isHslTriplet('0 0% 100%')).toBe(true);
    expect(isHslTriplet('142.5 71.2% 36.8%')).toBe(true);
  });

  it('rejects a wrapped or malformed value', () => {
    expect(isHslTriplet('hsl(240, 6%, 10%)')).toBe(false);
    expect(isHslTriplet('#1e1e1e')).toBe(false);
    expect(isHslTriplet('0.5rem')).toBe(false);
    expect(isHslTriplet('')).toBe(false);
  });
});
