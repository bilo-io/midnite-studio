import { createSpatialHash } from '../engine/spatial-hash';
import { mulberry32 } from '../engine/rng';
import type { SimEngine } from '../engine/types';

export type BoidsParams = {
  /** 10 to 2000. */
  count: number;
  box: number;
  separation: number;
  alignment: number;
  cohesion: number;
  radius: number;
  maxSpeed: number;
};

export const BOIDS_DEFAULTS: BoidsParams = { count: 400, box: 100, separation: 1.5, alignment: 1, cohesion: 1, radius: 5, maxSpeed: 4 };
export const BOIDS_MIN = 10;
export const BOIDS_MAX = 2000;
export const BOIDS_STRIDE = 6;

export type BoidsState = { pos: number[]; vel: number[]; tick: number };

const DT = 1 / 60;
const STEER = 5; // 1/s, how fast velocity relaxes toward the neighbours' mean
const WALL = 0.1; // the soft wall acts within this fraction of the box edge

/**
 * Reynolds boids in a cube (Phase 127 Theme E.2): separation, alignment and cohesion over the neighbours a
 * spatial hash finds, a soft force near the walls, speed held between half and the full `maxSpeed`. Positions
 * are in units, velocities in units per second; one tick is 1/60 s. The only random draws are at `init`.
 */
export function createBoids(): SimEngine<BoidsParams, BoidsState> {
  let p = BOIDS_DEFAULTS;
  let n = 0;
  let pos = new Float32Array(0);
  let vel = new Float32Array(0);
  let next = new Float32Array(0);
  let tick = 0;
  let hash = createSpatialHash(5, 100);

  const clampSpeed = (o: number) => {
    const sp = Math.hypot(next[o]!, next[o + 1]!, next[o + 2]!);
    const target = Math.min(p.maxSpeed, Math.max(p.maxSpeed * 0.5, sp));
    const k = sp === 0 ? 0 : target / sp;
    next[o] = next[o]! * k;
    next[o + 1] = next[o + 1]! * k;
    next[o + 2] = next[o + 2]! * k;
  };

  return {
    get capacity() {
      return BOIDS_STRIDE * n;
    },
    init(params, seed) {
      if (!(params.count >= BOIDS_MIN && params.count <= BOIDS_MAX)) throw new Error(`count must be ${BOIDS_MIN} to ${BOIDS_MAX}`);
      p = params;
      n = Math.floor(p.count);
      const rand = mulberry32(seed);
      pos = new Float32Array(3 * n);
      vel = new Float32Array(3 * n);
      next = new Float32Array(3 * n);
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < 3; k++) pos[3 * i + k] = rand() * p.box;
        // A uniformly random direction (z in [-1, 1], angle in [0, 2 pi)) at a random speed.
        const z = rand() * 2 - 1;
        const a = rand() * 2 * Math.PI;
        const r = Math.sqrt(1 - z * z);
        const sp = p.maxSpeed * (0.5 + 0.5 * rand());
        vel[3 * i] = r * Math.cos(a) * sp;
        vel[3 * i + 1] = r * Math.sin(a) * sp;
        vel[3 * i + 2] = z * sp;
      }
      hash = createSpatialHash(Math.max(p.radius, 1), p.box);
      tick = 0;
    },
    step() {
      hash.rebuild(pos, n);
      const margin = p.box * WALL;
      for (let i = 0; i < n; i++) {
        const o = 3 * i;
        let sx = 0, sy = 0, sz = 0; // separation
        let ax = 0, ay = 0, az = 0; // sum of neighbour velocity
        let cx = 0, cy = 0, cz = 0; // sum of neighbour position
        let count = 0;
        hash.forEachNear(i, p.radius, (j, d2) => {
          const q = 3 * j;
          const inv = 1 / (d2 + 0.01);
          sx += (pos[o]! - pos[q]!) * inv;
          sy += (pos[o + 1]! - pos[q + 1]!) * inv;
          sz += (pos[o + 2]! - pos[q + 2]!) * inv;
          ax += vel[q]!;
          ay += vel[q + 1]!;
          az += vel[q + 2]!;
          cx += pos[q]!;
          cy += pos[q + 1]!;
          cz += pos[q + 2]!;
          count++;
        });
        let fx = 0, fy = 0, fz = 0;
        if (count > 0) {
          fx += p.separation * sx * p.maxSpeed + p.alignment * STEER * (ax / count - vel[o]!) + p.cohesion * (cx / count - pos[o]!);
          fy += p.separation * sy * p.maxSpeed + p.alignment * STEER * (ay / count - vel[o + 1]!) + p.cohesion * (cy / count - pos[o + 1]!);
          fz += p.separation * sz * p.maxSpeed + p.alignment * STEER * (az / count - vel[o + 2]!) + p.cohesion * (cz / count - pos[o + 2]!);
        }
        const f = [fx, fy, fz];
        for (let k = 0; k < 3; k++) {
          const c = pos[o + k]!;
          const lo = margin - c;
          const hi = c - (p.box - margin);
          if (lo > 0) f[k] = f[k]! + (lo / margin) * p.maxSpeed * 4;
          else if (hi > 0) f[k] = f[k]! - (hi / margin) * p.maxSpeed * 4;
          next[o + k] = vel[o + k]! + f[k]! * DT;
        }
        clampSpeed(o);
      }
      for (let i = 0; i < 3 * n; i++) {
        vel[i] = next[i]!;
        pos[i] = Math.min(p.box, Math.max(0, pos[i]! + vel[i]! * DT));
      }
      tick++;
    },
    snapshot(out) {
      for (let i = 0; i < n; i++) {
        out.set(pos.subarray(3 * i, 3 * i + 3), BOIDS_STRIDE * i);
        out.set(vel.subarray(3 * i, 3 * i + 3), BOIDS_STRIDE * i + 3);
      }
      return BOIDS_STRIDE * n;
    },
    stats() {
      let speed = 0, ux = 0, uy = 0, uz = 0;
      for (let i = 0; i < n; i++) {
        const sp = Math.hypot(vel[3 * i]!, vel[3 * i + 1]!, vel[3 * i + 2]!);
        speed += sp;
        if (sp > 0) {
          ux += vel[3 * i]! / sp;
          uy += vel[3 * i + 1]! / sp;
          uz += vel[3 * i + 2]! / sp;
        }
      }
      return { count: n, meanSpeed: n === 0 ? 0 : speed / n, polarisation: n === 0 ? 0 : Math.hypot(ux, uy, uz) / n };
    },
    serialise: () => ({ pos: Array.from(pos), vel: Array.from(vel), tick }),
    restore(s) {
      if (s.pos.length !== 3 * n || s.vel.length !== 3 * n) throw new Error('state does not match the current count');
      pos.set(s.pos);
      vel.set(s.vel);
      tick = s.tick;
    },
  };
}
