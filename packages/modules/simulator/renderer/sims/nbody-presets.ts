import type { Body, NBodyParams } from './nbody';

export type NBodyPresetId = 'sun-earth-moon' | 'inner-solar' | 'figure-eight' | 'binary-star';

/** Gaussian gravitational constant squared: AU^3 / (M_sun day^2). */
export const G_AU = 2.959122082855911e-4;

const body = (name: string, mass: number, x: number, y: number, vx: number, vy: number, color: string, radius: number, z = 0, vz = 0): Body => ({
  name, mass, x, y, z, vx, vy, vz, color, radius,
});

/** A body on a circular orbit of radius `a` about a central mass `m`, starting on +x, moving +y, then shifted by `at`. */
const circular = (name: string, mass: number, a: number, centre: number, color: string, radius: number, at: Body | null = null): Body => {
  const v = Math.sqrt((G_AU * centre) / a);
  return body(name, mass, (at?.x ?? 0) + a, at?.y ?? 0, at?.vx ?? 0, (at?.vy ?? 0) + v, color, radius);
};

/** Shifts every body so the net momentum is zero (and the barycentre rests at the origin velocity-wise). */
function zeroMomentum(bodies: Body[]): Body[] {
  const m = bodies.reduce((s, b) => s + b.mass, 0);
  const p = [0, 1, 2].map((k) => bodies.reduce((s, b) => s + b.mass * [b.vx, b.vy, b.vz][k]!, 0) / m);
  return bodies.map((b) => ({ ...b, vx: b.vx - p[0]!, vy: b.vy - p[1]!, vz: b.vz - p[2]! }));
}

const EARTH = 3.003e-6;
const SUN_R = 0.00465;

function sunEarthMoon(): Body[] {
  const sun = body('Sun', 1, 0, 0, 0, 0, '#fbbf24', SUN_R);
  const earth = circular('Earth', EARTH, 1, 1, '#38bdf8', 0.0000426, sun);
  const moon = circular('Moon', 3.69e-8, 0.00257, EARTH, '#d4d4d8', 0.0000116, earth);
  return zeroMomentum([sun, earth, moon]);
}

function innerSolar(): Body[] {
  const sun = body('Sun', 1, 0, 0, 0, 0, '#fbbf24', SUN_R);
  return zeroMomentum([
    sun,
    circular('Mercury', 1.66e-7, 0.387, 1, '#a3a3a3', 0.0000163, sun),
    circular('Venus', 2.448e-6, 0.723, 1, '#fcd34d', 0.0000404, sun),
    circular('Earth', EARTH, 1, 1, '#38bdf8', 0.0000426, sun),
    circular('Mars', 3.227e-7, 1.524, 1, '#f87171', 0.0000227, sun),
  ]);
}

function figureEight(): Body[] {
  const [x, y, vx, vy] = [0.97000436, -0.24308753, 0.93240737, 0.86473146];
  return [
    body('A', 1, x, y, vx / 2, vy / 2, '#f87171', 0.03),
    body('B', 1, -x, -y, vx / 2, vy / 2, '#60a5fa', 0.03),
    body('C', 1, 0, 0, -vx, -vy, '#4ade80', 0.03),
  ];
}

function binaryStar(): Body[] {
  // Two 1 M_sun stars 1 AU apart orbit their barycentre at r = 0.5: v^2 = G m / (2 d).
  const v = Math.sqrt((G_AU * 1) / (4 * 0.5));
  const planetV = Math.sqrt((G_AU * 2) / 3);
  return zeroMomentum([
    body('Star A', 1, 0.5, 0, 0, v, '#fbbf24', SUN_R),
    body('Star B', 1, -0.5, 0, 0, -v, '#fb923c', SUN_R),
    body('Planet', 3e-6, 0, 3, -planetV, 0, '#38bdf8', 0.0000426),
  ]);
}

export type NBodyPreset = { id: NBodyPresetId; label: string; params: () => NBodyParams };

export const NBODY_PRESETS: readonly NBodyPreset[] = [
  { id: 'sun-earth-moon', label: 'Sun–Earth–Moon', params: () => ({ bodies: sunEarthMoon(), G: G_AU, dt: 0.5, softening: 0 }) },
  { id: 'inner-solar', label: 'Inner solar system', params: () => ({ bodies: innerSolar(), G: G_AU, dt: 0.5, softening: 0 }) },
  { id: 'figure-eight', label: 'Figure-eight', params: () => ({ bodies: figureEight(), G: 1, dt: 0.001, softening: 0 }) },
  { id: 'binary-star', label: 'Binary star', params: () => ({ bodies: binaryStar(), G: G_AU, dt: 0.5, softening: 0 }) },
];

export const presetParams = (id: NBodyPresetId): NBodyParams => NBODY_PRESETS.find((p) => p.id === id)!.params();
