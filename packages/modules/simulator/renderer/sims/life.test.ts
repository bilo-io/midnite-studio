import { describe, expect, it } from 'vitest';

import { createLifeEngine, parseRule, type LifeParams } from './life';

const params = (over: Partial<LifeParams> = {}): LifeParams => ({ width: 64, height: 64, rule: 'B3/S23', density: 0, ...over });

/** Engines clamp to 64 minimum, so these tests live on a 64x64 torus. */
function grid(cells: [number, number][], over: Partial<LifeParams> = {}) {
  const e = createLifeEngine();
  e.init(params(over), 1);
  const state = e.serialise();
  for (const [x, y] of cells) state.cells[y * state.width + x] = 1;
  e.restore(state);
  return e;
}
const alive = (e: ReturnType<typeof createLifeEngine>) => {
  const s = e.serialise();
  const out: [number, number][] = [];
  s.cells.forEach((v, i) => v && out.push([i % s.width, Math.floor(i / s.width)]));
  return out.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
};

describe('parseRule', () => {
  it('parses B3/S23 and rejects junk', () => {
    expect(parseRule('B3/S23')).toEqual({ birth: new Set([3]), survive: new Set([2, 3]) });
    expect(parseRule('B2/S')).toEqual({ birth: new Set([2]), survive: new Set() });
    expect(parseRule('X3')).toBeNull();
    expect(parseRule('B9/S2')).toBeNull();
  });
});

describe('life engine', () => {
  it('oscillates a blinker with period 2', () => {
    const e = grid([[10, 10], [11, 10], [12, 10]]);
    const start = alive(e);
    e.step();
    expect(alive(e)).toEqual([[11, 9], [11, 10], [11, 11]]);
    e.step();
    expect(alive(e)).toEqual(start);
  });

  it('moves a glider (1, 1) in 4 generations, wrapping at the edge', () => {
    const glider: [number, number][] = [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]];
    // Placed against the torus seam so the wrap is exercised.
    const near = glider.map(([x, y]) => [(x + 62) % 64, (y + 62) % 64] as [number, number]);
    const e = grid(near);
    for (let i = 0; i < 4; i++) e.step();
    const moved = near.map(([x, y]) => [(x + 1) % 64, (y + 1) % 64] as [number, number]);
    expect(alive(e)).toEqual(moved.sort((a, b) => a[1] - b[1] || a[0] - b[0]));
    expect(e.stats()).toEqual({ population: 5, generation: 4 });
  });

  it('is deterministic from a seed and reports population', () => {
    const a = createLifeEngine();
    const b = createLifeEngine();
    a.init(params({ density: 0.3 }), 9);
    b.init(params({ density: 0.3 }), 9);
    expect(alive(a)).toEqual(alive(b));
    expect(a.stats().population).toBeGreaterThan(0);
  });

  it('snapshots one float per cell', () => {
    const e = grid([[0, 0]]);
    const out = new Float32Array(e.capacity);
    expect(e.snapshot(out)).toBe(64 * 64);
    expect(out[0]).toBe(1);
    expect(out[1]).toBe(0);
  });

  it('steps a 1024x1024 grid 10 generations', () => {
    const e = createLifeEngine();
    e.init({ width: 1024, height: 1024, rule: 'B3/S23', density: 0.2 }, 3);
    for (let i = 0; i < 10; i++) e.step();
    expect(e.stats().generation).toBe(10);
  });

  it('refuses a restore of the wrong size', () => {
    const e = grid([]);
    expect(() => e.restore({ width: 8, height: 8, cells: new Uint8Array(64), generation: 0 })).toThrow();
  });
});
