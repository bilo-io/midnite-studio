import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HEAD_LANE_IDX, laneColor, laneHsl, laneVars } from './lane-colors';
import { __resetPrimaryLane, FALLBACK_PRIMARY, parseRgb, rgbToHsl, usePrimaryHsl } from './primary-lane';

afterEach(() => {
  __resetPrimaryLane();
  document.documentElement.removeAttribute('style');
});

describe('rgbToHsl / parseRgb', () => {
  it('converts the resolved computed colour', () => {
    expect(rgbToHsl(255, 0, 0)).toEqual([0, 100, 50]);
    expect(rgbToHsl(128, 128, 128)).toEqual([0, 0, 50]);
    expect(parseRgb('rgb(0, 0, 255)')).toEqual([240, 100, 50]);
    expect(parseRgb('rgb(0 255 0 / 0.5)')).toEqual([120, 100, 50]);
    expect(parseRgb('')).toBeNull();
  });
});

describe('the HEAD lane colour', () => {
  it('is the primary colour, in every palette style', () => {
    const [h, s, l] = laneHsl(HEAD_LANE_IDX, 'vivid');
    expect(laneHsl(HEAD_LANE_IDX, 'muted')).toEqual([h, s, l]);
    expect(laneColor(HEAD_LANE_IDX)).toBe(`hsl(${h} ${s}% ${l}%)`);
    expect(laneVars(HEAD_LANE_IDX)).toMatchObject({ '--lane-h': `${h}` });
  });

  it('is not any hashed palette slot, so no other lane can share the index', () => {
    for (let i = 0; i < 10; i += 1) expect(i).not.toBe(HEAD_LANE_IDX);
  });

  it('falls back when no primary token resolves (jsdom)', () => {
    expect(laneHsl(HEAD_LANE_IDX)).toEqual(FALLBACK_PRIMARY);
  });

  it('re-renders subscribers with the new colour when <html> changes (accent or theme switch)', async () => {
    // jsdom cannot resolve hsl(var(--primary)); stand in for the browser by
    // resolving it from the custom property the shell writes on <html>.
    const real = window.getComputedStyle.bind(window);
    const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
      const style = real(el, pseudo);
      const raw = document.documentElement.style.getPropertyValue('--test-rgb');
      return raw ? ({ color: raw } as CSSStyleDeclaration) : style;
    });
    const seen: string[] = [];
    function Probe() {
      seen.push(usePrimaryHsl().join(','));
      return null;
    }
    document.documentElement.style.setProperty('--test-rgb', 'rgb(0, 0, 255)');
    render(<Probe />);
    expect(seen.at(-1)).toBe('240,100,50');
    await act(async () => {
      document.documentElement.style.setProperty('--test-rgb', 'rgb(255, 0, 0)');
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(seen.at(-1)).toBe('0,100,50');
    expect(laneHsl(HEAD_LANE_IDX)).toEqual([0, 100, 50]);
    spy.mockRestore();
  });
});
