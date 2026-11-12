import { mulberry32 } from '../engine/rng';
import type { SimEngine } from '../engine/types';

export type LifeParams = { width: number; height: number; rule: string; density: number };
export type LifeState = { width: number; height: number; cells: Uint8Array; generation: number };

export const LIFE_MIN = 64;
export const LIFE_MAX = 1024;
export const LIFE_DEFAULTS: LifeParams = { width: 256, height: 256, rule: 'B3/S23', density: 0.3 };

/** Named Life-like rules the side panel offers. */
export const LIFE_PRESETS: readonly { label: string; rule: string }[] = [
  { label: 'Life', rule: 'B3/S23' },
  { label: 'HighLife', rule: 'B36/S23' },
  { label: 'Seeds', rule: 'B2/S' },
  { label: 'Day & Night', rule: 'B3678/S34678' },
];

export const RULE_HINT = 'Rule must look like B3/S23';

/** Parses `B<digits>/S<digits>` (neighbour counts 0-8); `null` when it does not look like one. */
export function parseRule(rule: string): { birth: Set<number>; survive: Set<number> } | null {
  const m = /^B([0-8]*)\/S([0-8]*)$/i.exec(rule.trim());
  if (m === null) return null;
  const digits = (s: string) => new Set([...s].map(Number));
  return { birth: digits(m[1]!), survive: digits(m[2]!) };
}

const clampSize = (n: number) => Math.min(LIFE_MAX, Math.max(LIFE_MIN, Math.round(n)));

/**
 * Life-like cellular automaton on a toroidal grid (Phase 127 Theme C.1). Two `Uint8Array`s double-buffered;
 * neighbours are summed from row offsets, no per-cell allocation. `snapshot` writes one float per cell (0 or 1).
 */
export function createLifeEngine(): SimEngine<LifeParams, LifeState> {
  let w = 0;
  let h = 0;
  let cur = new Uint8Array(0);
  let nxt = new Uint8Array(0);
  let generation = 0;
  let population = 0;
  const birth = new Uint8Array(9);
  const survive = new Uint8Array(9);

  const setRule = (rule: string) => {
    const parsed = parseRule(rule) ?? parseRule(LIFE_DEFAULTS.rule)!;
    for (let n = 0; n <= 8; n++) {
      birth[n] = parsed.birth.has(n) ? 1 : 0;
      survive[n] = parsed.survive.has(n) ? 1 : 0;
    }
  };
  const count = () => {
    let p = 0;
    for (let i = 0; i < cur.length; i++) p += cur[i]!;
    population = p;
  };

  return {
    get capacity() {
      return w * h;
    },
    init(params, seed) {
      w = clampSize(params.width);
      h = clampSize(params.height);
      setRule(params.rule);
      cur = new Uint8Array(w * h);
      nxt = new Uint8Array(w * h);
      const rand = mulberry32(seed);
      const density = Math.min(1, Math.max(0, params.density));
      for (let i = 0; i < cur.length; i++) cur[i] = rand() < density ? 1 : 0;
      generation = 0;
      count();
    },
    step() {
      let pop = 0;
      for (let y = 0; y < h; y++) {
        const up = (y === 0 ? h - 1 : y - 1) * w;
        const mid = y * w;
        const dn = (y === h - 1 ? 0 : y + 1) * w;
        for (let x = 0; x < w; x++) {
          const l = x === 0 ? w - 1 : x - 1;
          const r = x === w - 1 ? 0 : x + 1;
          const n =
            cur[up + l]! + cur[up + x]! + cur[up + r]! + cur[mid + l]! + cur[mid + r]! + cur[dn + l]! + cur[dn + x]! + cur[dn + r]!;
          const alive = cur[mid + x] === 1 ? survive[n]! : birth[n]!;
          nxt[mid + x] = alive;
          pop += alive;
        }
      }
      const t = cur;
      cur = nxt;
      nxt = t;
      generation += 1;
      population = pop;
    },
    snapshot(out) {
      for (let i = 0; i < cur.length; i++) out[i] = cur[i]!;
      return cur.length;
    },
    stats: () => ({ population, generation }),
    serialise: () => ({ width: w, height: h, cells: cur.slice(), generation }),
    restore(state) {
      if (state.width !== w || state.height !== h || state.cells.length !== w * h) throw new Error('Grid size does not match');
      cur.set(state.cells);
      generation = state.generation;
      count();
    },
  };
}
