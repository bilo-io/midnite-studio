import { describe, expect, it } from 'vitest';

import { hslTokenToHex } from './color';

describe('hslTokenToHex', () => {
  it('converts the dark background token', () => {
    // --background in the dark theme; the value the window is tinted with.
    expect(hslTokenToHex('240 10% 3.9%')).toBe('#09090b');
  });

  it('converts the light background token', () => {
    expect(hslTokenToHex('0 0% 100%')).toBe('#ffffff');
  });

  it('converts the primary hues across all six sectors', () => {
    expect(hslTokenToHex('0 100% 50%')).toBe('#ff0000');
    expect(hslTokenToHex('60 100% 50%')).toBe('#ffff00');
    expect(hslTokenToHex('120 100% 50%')).toBe('#00ff00');
    expect(hslTokenToHex('180 100% 50%')).toBe('#00ffff');
    expect(hslTokenToHex('240 100% 50%')).toBe('#0000ff');
    expect(hslTokenToHex('300 100% 50%')).toBe('#ff00ff');
  });

  it('handles a hue at and beyond the wrap point', () => {
    expect(hslTokenToHex('360 100% 50%')).toBe('#ff0000');
    expect(hslTokenToHex('420 100% 50%')).toBe('#ffff00');
  });

  it('produces grey for zero saturation', () => {
    expect(hslTokenToHex('210 0% 50%')).toBe('#808080');
  });

  it('falls back to black rather than throwing on junk', () => {
    // The token is read from computed styles; an unset var yields ''.
    expect(hslTokenToHex('')).toBe('#000000');
    expect(hslTokenToHex('not a colour')).toBe('#000000');
  });
});
