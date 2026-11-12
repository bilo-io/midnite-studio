import { mulberry32 } from '../engine/rng';
import type { SimEngine } from '../engine/types';

export type ElementaryParams = { rule: number; width: number; height: number; start: 'single' | 'random' };
export type ElementaryState = { rows: Uint8Array; row: number; generation: number };

export const ELEMENTARY_DEFAULTS: ElementaryParams = { rule: 90, width: 512, height: 256, start: 'single' };
export const ELEMENTARY_MIN_WIDTH = 128;
export const ELEMENTARY_MAX_WIDTH = 1024;

/**
 * Elementary 1-D cellular automaton, rules 0-255 on a ring (Phase 127 Theme C.3). The engine keeps the last
 * `height` rows as a space-time diagram: row 0 is the start, each tick appends the next row beneath it and,
 * once full, scrolls the diagram up. `snapshot` writes the whole diagram, so a dropped frame loses no rows.
 */
export function createElementaryEngine(): SimEngine<ElementaryParams, ElementaryState> {
  let w = 0;
  let h = 0;
  let rule = 0;
  let rows = new Uint8Array(0);
  let row = 0;
  let generation = 0;

  return {
    get capacity() {
      return w * h;
    },
    init(params, seed) {
      w = Math.min(ELEMENTARY_MAX_WIDTH, Math.max(ELEMENTARY_MIN_WIDTH, Math.round(params.width)));
      h = Math.min(1024, Math.max(32, Math.round(params.height)));
      rule = Math.min(255, Math.max(0, Math.round(params.rule)));
      rows = new Uint8Array(w * h);
      row = 0;
      generation = 0;
      if (params.start === 'single') rows[w >> 1] = 1;
      else {
        const rand = mulberry32(seed);
        for (let x = 0; x < w; x++) rows[x] = rand() < 0.5 ? 1 : 0;
      }
    },
    step() {
      // Scrolling moves the newest row up one slot, so the source is then the row just above the last one.
      const scroll = row === h - 1;
      if (scroll) rows.copyWithin(0, w);
      else row += 1;
      const to = row * w;
      const src = to - w;
      for (let x = 0; x < w; x++) {
        const l = rows[src + (x === 0 ? w - 1 : x - 1)]!;
        const c = rows[src + x]!;
        const r = rows[src + (x === w - 1 ? 0 : x + 1)]!;
        rows[to + x] = (rule >> ((l << 2) | (c << 1) | r)) & 1;
      }
      generation += 1;
    },
    snapshot(out) {
      for (let i = 0; i < rows.length; i++) out[i] = rows[i]!;
      return rows.length;
    },
    stats: () => ({ generation }),
    serialise: () => ({ rows: rows.slice(), row, generation }),
    restore(state) {
      if (state.rows.length !== w * h) throw new Error('Diagram size does not match');
      rows.set(state.rows);
      row = state.row;
      generation = state.generation;
    },
  };
}
