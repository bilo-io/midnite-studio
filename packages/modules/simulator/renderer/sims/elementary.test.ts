import { describe, expect, it } from 'vitest';

import { createElementaryEngine, type ElementaryParams } from './elementary';

const params = (over: Partial<ElementaryParams> = {}): ElementaryParams => ({ rule: 90, width: 128, height: 32, start: 'single', ...over });
const rowOf = (e: ReturnType<typeof createElementaryEngine>, y: number, w = 128) => {
  const out = new Float32Array(e.capacity);
  e.snapshot(out);
  return Array.from(out.slice(y * w, (y + 1) * w));
};
const at = (row: number[]) => row.flatMap((v, i) => (v ? [i - 64] : []));

describe('elementary engine', () => {
  it('rule 90 from one cell draws a Sierpinski triangle', () => {
    const e = createElementaryEngine();
    e.init(params(), 1);
    e.step();
    e.step();
    expect(at(rowOf(e, 0))).toEqual([0]);
    expect(at(rowOf(e, 1))).toEqual([-1, 1]);
    expect(at(rowOf(e, 2))).toEqual([-2, 2]);
  });

  it('rule 0 empties after one step', () => {
    const e = createElementaryEngine();
    e.init(params({ rule: 0 }), 1);
    e.step();
    expect(at(rowOf(e, 1))).toEqual([]);
  });

  it('scrolls once the diagram is full, keeping the newest row last', () => {
    const e = createElementaryEngine();
    e.init(params({ height: 32 }), 1);
    for (let i = 0; i < 40; i++) e.step();
    expect(e.stats().generation).toBe(40);
    // Generation 40 of rule 90 from one cell has 2^popcount(40) = 4 live cells; the diagram's last row shows it.
    expect(rowOf(e, 31).reduce((a, b) => a + b, 0)).toBe(4);
  });

  it('is deterministic from a seed with a random start', () => {
    const a = createElementaryEngine();
    const b = createElementaryEngine();
    a.init(params({ start: 'random' }), 5);
    b.init(params({ start: 'random' }), 5);
    expect(rowOf(a, 0)).toEqual(rowOf(b, 0));
  });

  it('round-trips its state', () => {
    const e = createElementaryEngine();
    e.init(params(), 1);
    for (let i = 0; i < 5; i++) e.step();
    const s = e.serialise();
    e.step();
    e.restore(s);
    expect(e.stats().generation).toBe(5);
    expect(e.serialise()).toEqual(s);
  });
});
