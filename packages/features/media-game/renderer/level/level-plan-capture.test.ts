// vitest/jsdom: the region maths and the canvas calls against a recording 2D context (no real canvas needed).
import { describe, expect, it, vi } from 'vitest';

import { toEditLevel } from './level-edit-model';
import { capturePlan, planSourceRect } from './level-plan-capture';
import { blankLevel3d } from './test-helpers';

const level = () => toEditLevel(blankLevel3d())!;
const overlay = { terrain: null, terrainImage: null, draft: [], cursor: null, volume: null };

describe('planSourceRect (H1)', () => {
  it('adds a 10% margin to the selection bounds', () => {
    expect(planSourceRect(level(), null, { x: 100, y: 200, width: 100, height: 50 })).toEqual({ x: 90, y: 195, width: 120, height: 60 });
  });

  it('with no rectangle takes the whole map plus the same margin', () => {
    const r = planSourceRect(level(), null, null);
    expect(r.width).toBeCloseTo(640 * 1.2, 5);
    expect(r.height).toBeCloseTo(640 * 1.2, 5);
  });
});

describe('capturePlan', () => {
  it('fills the background, fits the source rect and encodes the canvas', async () => {
    const calls: string[] = [];
    const proxy = new Proxy({} as Record<string, unknown>, {
      get: (_t, name: string) => (...args: unknown[]) => void calls.push(`${name}(${args.join(',')})`),
      set: () => true,
    });
    const canvas = { getContext: () => proxy } as unknown as OffscreenCanvas;
    const encode = vi.fn(async () => 'PNG');
    const png = await capturePlan({ level: level(), overlay, selection: null, selected: [], rect: null, width: 960, height: 600 }, { createCanvas: () => canvas, encode });
    expect(png).toBe('PNG');
    expect(encode).toHaveBeenCalledWith(canvas);
    expect(calls).toContain('fillRect(0,0,960,600)');
    expect(calls.some((c) => c.startsWith('scale('))).toBe(true);
  });
});
