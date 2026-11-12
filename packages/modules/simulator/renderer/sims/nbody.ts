import type { SimEngine } from '../engine/types';

export type Body = {
  name: string;
  mass: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  color: string;
  radius: number;
};

export type NBodyParams = { bodies: Body[]; G: number; dt: number; softening: number };

export const MAX_BODIES = 200;

export type NBodyState = { pos: number[]; vel: number[]; e0: number; tick: number };

/**
 * Direct O(n^2) n-body gravity (Phase 127 Theme D.1), integrated with velocity-Verlet (kick-drift-kick).
 * The force is softened, a = G m r / (|r|^2 + eps^2)^(3/2), so close passes stay bounded; collisions are not
 * resolved. Nothing here draws a random number, so `seed` is accepted and ignored.
 */
export function createNBody(): SimEngine<NBodyParams, NBodyState> {
  let params: NBodyParams = { bodies: [], G: 1, dt: 0.001, softening: 0 };
  let n = 0;
  let mass = new Float64Array(0);
  let pos = new Float64Array(0);
  let vel = new Float64Array(0);
  let acc = new Float64Array(0);
  let e0 = 0;
  let tick = 0;

  const accelerate = () => {
    const { G, softening } = params;
    const eps2 = softening * softening;
    acc.fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[3 * j]! - pos[3 * i]!;
        const dy = pos[3 * j + 1]! - pos[3 * i + 1]!;
        const dz = pos[3 * j + 2]! - pos[3 * i + 2]!;
        const r2 = dx * dx + dy * dy + dz * dz + eps2;
        if (r2 === 0) continue; // coincident bodies with no softening: no direction, no force
        const inv = G / (r2 * Math.sqrt(r2));
        const fi = inv * mass[j]!;
        const fj = inv * mass[i]!;
        acc[3 * i] = acc[3 * i]! + dx * fi;
        acc[3 * i + 1] = acc[3 * i + 1]! + dy * fi;
        acc[3 * i + 2] = acc[3 * i + 2]! + dz * fi;
        acc[3 * j] = acc[3 * j]! - dx * fj;
        acc[3 * j + 1] = acc[3 * j + 1]! - dy * fj;
        acc[3 * j + 2] = acc[3 * j + 2]! - dz * fj;
      }
    }
  };

  const energy = () => {
    const { G, softening } = params;
    const eps2 = softening * softening;
    let e = 0;
    for (let i = 0; i < n; i++) {
      const v2 = vel[3 * i]! ** 2 + vel[3 * i + 1]! ** 2 + vel[3 * i + 2]! ** 2;
      e += 0.5 * mass[i]! * v2;
      for (let j = i + 1; j < n; j++) {
        const dx = pos[3 * j]! - pos[3 * i]!;
        const dy = pos[3 * j + 1]! - pos[3 * i + 1]!;
        const dz = pos[3 * j + 2]! - pos[3 * i + 2]!;
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz + eps2);
        if (r > 0) e -= (G * mass[i]! * mass[j]!) / r;
      }
    }
    return e;
  };

  const kick = (h: number) => {
    for (let k = 0; k < 3 * n; k++) vel[k] = vel[k]! + acc[k]! * h;
  };

  return {
    get capacity() {
      return 3 * n;
    },
    init(p) {
      if (p.bodies.length > MAX_BODIES) throw new Error(`${MAX_BODIES} bodies is the limit`);
      if (!(p.dt > 0)) throw new Error('dt must be positive');
      params = p;
      n = p.bodies.length;
      mass = new Float64Array(n);
      pos = new Float64Array(3 * n);
      vel = new Float64Array(3 * n);
      acc = new Float64Array(3 * n);
      p.bodies.forEach((b, i) => {
        mass[i] = b.mass;
        pos.set([b.x, b.y, b.z], 3 * i);
        vel.set([b.vx, b.vy, b.vz], 3 * i);
      });
      tick = 0;
      accelerate();
      e0 = energy();
    },
    step() {
      const h = params.dt;
      kick(h / 2);
      for (let k = 0; k < 3 * n; k++) pos[k] = pos[k]! + vel[k]! * h;
      accelerate();
      kick(h / 2);
      tick++;
    },
    snapshot(out) {
      for (let k = 0; k < 3 * n; k++) out[k] = pos[k]!;
      return 3 * n;
    },
    stats() {
      const e = energy();
      return { energy: e, energyDrift: e0 === 0 ? Math.abs(e) : Math.abs(e - e0) / Math.abs(e0) };
    },
    serialise: () => ({ pos: Array.from(pos), vel: Array.from(vel), e0, tick }),
    restore(s) {
      if (s.pos.length !== 3 * n || s.vel.length !== 3 * n) throw new Error('state does not match the current bodies');
      pos.set(s.pos);
      vel.set(s.vel);
      e0 = s.e0;
      tick = s.tick;
      accelerate();
    },
  };
}
