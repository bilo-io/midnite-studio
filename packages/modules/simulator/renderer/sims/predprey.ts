import { createSpatialHash } from '../engine/spatial-hash';
import { mulberry32 } from '../engine/rng';
import type { SimEngine } from '../engine/types';

export type PredPreyParams = {
  prey: number;
  predators: number;
  box: number;
  /** Chance per tick that a prey over its energy threshold reproduces. */
  preyBirth: number;
  predatorBirth: number;
  /** Energy a predator gains from one prey. */
  eatGain: number;
  /** Energy every agent starts with; prey breed from 80. Optional, default 50. */
  startEnergy?: number;
};

export const PREDPREY_DEFAULTS: PredPreyParams = { prey: 300, predators: 20, box: 100, preyBirth: 0.005, predatorBirth: 0.05, eatGain: 40 };
export const AGENT_CAP = 5000;
export const PREDPREY_STRIDE = 7;

export type PredPreyState = { agents: number[]; draws: number; tick: number };

const DT = 1 / 60;
const PREY_SPEED = 5;
const PREDATOR_SPEED = 6;
const FLEE_RANGE = 8;
const HUNT_RANGE = 15;
const EAT_RANGE = 1;
// Energy per tick. Prey graze back more than they pay, so only predators starve.
const PREY_DRAIN = 0.02;
const PREY_GRAZE = 0.1;
const PREDATOR_DRAIN = 0.1;
const PREY_BREED_AT = 80;
const PREDATOR_BREED_AT = 80;
const MAX_ENERGY = 120;
const START_ENERGY = 50;
// One agent is 7 floats: x, y, vx, vy, energy, species (0 prey, 1 predator), alive.
const F = 7;

/**
 * Predator-prey on a plane (Phase 127 Theme E.3), z = 0. Prey wander and flee predators within 8 units; a
 * predator steers to the nearest prey within 15 and eats it within 1. Every agent pays an energy drain each
 * tick (prey graze back more than they pay, so only predators starve); one over its threshold splits its
 * energy with a child with a seeded probability. Population is capped at 5000: at the cap births stop.
 */
export function createPredPrey(): SimEngine<PredPreyParams, PredPreyState> {
  let p = PREDPREY_DEFAULTS;
  let agents = new Float32Array(F * AGENT_CAP);
  const pos3 = new Float32Array(3 * AGENT_CAP);
  let n = 0;
  let tick = 0;
  let draws = 0;
  let seed0 = 0;
  let rand = mulberry32(0);
  let hash = createSpatialHash(10, 100);
  let preyCount = 0;
  let predCount = 0;

  const draw = () => {
    draws++;
    return rand();
  };

  const spawn = (x: number, y: number, species: number, energy: number) => {
    const a = draw() * 2 * Math.PI;
    const sp = species === 0 ? PREY_SPEED : PREDATOR_SPEED;
    const o = F * n++;
    agents[o] = x;
    agents[o + 1] = y;
    agents[o + 2] = Math.cos(a) * sp;
    agents[o + 3] = Math.sin(a) * sp;
    agents[o + 4] = energy;
    agents[o + 5] = species;
    agents[o + 6] = 1;
  };

  // The neighbour visitor is built once; the per-agent inputs and results live in these locals.
  let cur = 0;
  let curPrey = true;
  let fleeX = 0;
  let fleeY = 0;
  let bestD2 = Infinity;
  let bestJ = -1;
  const visit = (j: number, d2: number) => {
    const q = F * j;
    if (agents[q + 6] === 0) return;
    const o = F * cur;
    const otherPrey = agents[q + 5] === 0;
    if (curPrey && !otherPrey) {
      const inv = 1 / (d2 + 0.01);
      fleeX += (agents[o]! - agents[q]!) * inv;
      fleeY += (agents[o + 1]! - agents[q + 1]!) * inv;
    } else if (!curPrey && otherPrey && d2 < bestD2) {
      bestD2 = d2;
      bestJ = j;
    }
  };

  const count = () => {
    preyCount = 0;
    predCount = 0;
    for (let i = 0; i < n; i++) {
      if (agents[F * i + 5] === 0) preyCount++;
      else predCount++;
    }
  };

  return {
    get capacity() {
      return PREDPREY_STRIDE * AGENT_CAP;
    },
    init(params, seed) {
      if (params.prey < 0 || params.predators < 0) throw new Error('populations cannot be negative');
      p = params;
      seed0 = seed;
      rand = mulberry32(seed);
      draws = 0;
      agents = new Float32Array(F * AGENT_CAP);
      n = 0;
      tick = 0;
      const total = Math.min(AGENT_CAP, Math.floor(p.prey) + Math.floor(p.predators));
      const predators = Math.min(Math.floor(p.predators), total);
      for (let i = 0; i < total; i++) spawn(draw() * p.box, draw() * p.box, i < total - predators ? 0 : 1, p.startEnergy ?? START_ENERGY);
      hash = createSpatialHash(10, p.box);
      count();
    },
    step() {
      for (let i = 0; i < n; i++) {
        pos3[3 * i] = agents[F * i]!;
        pos3[3 * i + 1] = agents[F * i + 1]!;
        pos3[3 * i + 2] = 0;
      }
      hash.rebuild(pos3, n);
      for (let i = 0; i < n; i++) {
        const o = F * i;
        if (agents[o + 6] === 0) continue;
        const prey = agents[o + 5] === 0;
        const speed = prey ? PREY_SPEED : PREDATOR_SPEED;
        let dx = 0;
        let dy = 0;
        cur = i;
        curPrey = prey;
        fleeX = 0;
        fleeY = 0;
        bestD2 = Infinity;
        bestJ = -1;
        hash.forEachNear(i, prey ? FLEE_RANGE : HUNT_RANGE, visit);
        dx = fleeX;
        dy = fleeY;
        if (bestJ >= 0) {
          const q = F * bestJ;
          if (bestD2 <= EAT_RANGE * EAT_RANGE) {
            agents[q + 6] = 0;
            agents[o + 4] = Math.min(MAX_ENERGY, agents[o + 4]! + p.eatGain);
          }
          const d = Math.sqrt(bestD2) || 1;
          dx = (agents[q]! - agents[o]!) / d;
          dy = (agents[q + 1]! - agents[o + 1]!) / d;
        }
        // Wander: turn the heading a little every tick, then lean toward the steering direction.
        const turn = (draw() - 0.5) * 0.4;
        let vx = agents[o + 2]! * Math.cos(turn) - agents[o + 3]! * Math.sin(turn);
        let vy = agents[o + 2]! * Math.sin(turn) + agents[o + 3]! * Math.cos(turn);
        const dl = Math.hypot(dx, dy);
        if (dl > 0) {
          const lean = dl > 0 && (prey || bestJ >= 0) ? 0.3 : 0;
          vx += (dx / dl) * speed * lean;
          vy += (dy / dl) * speed * lean;
        }
        const vl = Math.hypot(vx, vy) || 1;
        vx = (vx / vl) * speed;
        vy = (vy / vl) * speed;
        let x = agents[o]! + vx * DT;
        let y = agents[o + 1]! + vy * DT;
        if (x < 0 || x > p.box) {
          vx = -vx;
          x = Math.min(p.box, Math.max(0, x));
        }
        if (y < 0 || y > p.box) {
          vy = -vy;
          y = Math.min(p.box, Math.max(0, y));
        }
        agents[o] = x;
        agents[o + 1] = y;
        agents[o + 2] = vx;
        agents[o + 3] = vy;
        agents[o + 4] = Math.min(MAX_ENERGY, agents[o + 4]! + (prey ? PREY_GRAZE - PREY_DRAIN : -PREDATOR_DRAIN));
        if (agents[o + 4]! <= 0) agents[o + 6] = 0;
      }
      // Births (stopped at the cap), then compact out the dead.
      const born = n;
      for (let i = 0; i < born; i++) {
        const o = F * i;
        if (agents[o + 6] === 0 || n >= AGENT_CAP) continue;
        const prey = agents[o + 5] === 0;
        if (agents[o + 4]! < (prey ? PREY_BREED_AT : PREDATOR_BREED_AT)) continue;
        if (draw() < (prey ? p.preyBirth : p.predatorBirth)) {
          const half = agents[o + 4]! / 2;
          agents[o + 4] = half;
          spawn(agents[o]!, agents[o + 1]!, prey ? 0 : 1, half);
        }
      }
      let w = 0;
      for (let i = 0; i < n; i++) {
        if (agents[F * i + 6] === 0) continue;
        if (w !== i) agents.copyWithin(F * w, F * i, F * i + F);
        w++;
      }
      n = w;
      tick++;
      count();
    },
    snapshot(out) {
      for (let i = 0; i < n; i++) {
        const o = F * i;
        const s = PREDPREY_STRIDE * i;
        out[s] = agents[o]!;
        out[s + 1] = agents[o + 1]!;
        out[s + 2] = 0;
        out[s + 3] = agents[o + 2]!;
        out[s + 4] = agents[o + 3]!;
        out[s + 5] = 0;
        out[s + 6] = agents[o + 5]!;
      }
      return PREDPREY_STRIDE * n;
    },
    stats: () => ({ prey: preyCount, predators: predCount, atCap: n >= AGENT_CAP ? 1 : 0 }),
    serialise: () => ({ agents: Array.from(agents.subarray(0, F * n)), draws, tick }),
    restore(s) {
      if (s.agents.length % F !== 0 || s.agents.length > F * AGENT_CAP) throw new Error('bad predator-prey state');
      agents = new Float32Array(F * AGENT_CAP);
      agents.set(s.agents);
      n = s.agents.length / F;
      tick = s.tick;
      rand = mulberry32(seed0);
      for (draws = 0; draws < s.draws; ) draw();
      count();
    },
  };
}
