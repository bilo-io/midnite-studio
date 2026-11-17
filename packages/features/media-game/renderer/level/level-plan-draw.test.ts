import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEditState, toEditLevel } from './level-edit-model';
import { drawHighlight, hslTripletToHex, prefersReducedMotion, PULSE_MS, pulseFrame, themeColour } from './level-plan-draw';
import { blankLevel } from './test-helpers';

// vitest/jsdom: colour maths and the pulse's frame logic; the drawn pixels are a real-browser check.
const near = (hex: string | null, want: string): void => {
  expect(hex).not.toBeNull();
  for (const i of [1, 3, 5]) expect(Math.abs(parseInt(hex!.slice(i, i + 2), 16) - parseInt(want.slice(i, i + 2), 16))).toBeLessThanOrEqual(1);
};

describe('hslTripletToHex and themeColour (F7)', () => {
  it('converts a triplet within one per channel', () => {
    near(hslTripletToHex('38 92% 50%'), '#f59f0a');
    expect(hslTripletToHex('0 0% 100%')).toBe('#ffffff');
    expect(hslTripletToHex('not a colour')).toBeNull();
  });

  it('falls back to the hex when the token is missing, and reads it once set', () => {
    expect(themeColour('no-such-token', '#123456')).toBe('#123456');
    document.documentElement.style.setProperty('--probe', '38 92% 50%');
    near(themeColour('probe', '#000000'), '#f59f0a');
    document.documentElement.style.removeProperty('--probe');
  });
});

describe('the agent pulse (F4)', () => {
  afterEach(() => {
    delete document.documentElement.dataset.motion;
    vi.restoreAllMocks();
  });
  const level = () => createEditState(toEditLevel(blankLevel())!).level;
  const ctxSpy = () => {
    const calls: string[] = [];
    const ctx = new Proxy({}, { get: (_t, name) => (name === 'canvas' ? {} : (...args: unknown[]) => void calls.push(`${String(name)}:${args.length}`)), set: () => true });
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
  };

  it('ends after 2.4 s, and under reduced motion is a static full-strength ring', () => {
    const h = { ids: [1], startedAt: 1000 };
    expect(pulseFrame(h, 1000 + PULSE_MS, false)).toBeNull();
    expect(pulseFrame(h, 1500, true)).toEqual({ grow: 0, alpha: 1 });
    expect(pulseFrame(h, 1500, false)?.alpha).toBeLessThan(1);
  });

  it('draws a ring per highlighted object without requesting an animation frame under data-motion="reduced"', () => {
    document.documentElement.dataset.motion = 'reduced';
    expect(prefersReducedMotion()).toBe(true);
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const lv = level();
    const id = lv.layers.flatMap((l) => l.objects ?? [])[0]?.id ?? 1;
    const { ctx, calls } = ctxSpy();
    drawHighlight(ctx, { level: lv, view: { x: 0, y: 0, zoom: 1 }, highlight: { ids: [id], startedAt: 1000 }, now: 1200, reduced: true });
    expect(calls.filter((c) => c.startsWith('arc'))).toHaveLength(1);
    expect(raf).not.toHaveBeenCalled();
  });
});
