import { z } from 'zod';

import { applyDirection, applyPoint, invert, type Mat4 } from '../math';
import type { V3 } from './brush';

/**
 * Sculpt symmetry (Phase 104 Theme D): one dab becomes up to eight, mirrored across the enabled axis
 * planes. It lives in the kernel, not the editor, so a stroke an agent sends over MCP (Theme E) mirrors
 * exactly as one drawn by hand.
 *
 * `local` mirrors across the mesh's own planes through its origin (where a converted or baked mesh is
 * centred); `world` mirrors across the scene's planes, which needs the part's world matrix to carry the
 * dab out to world space and back.
 */
export const SculptSymmetrySchema = z.object({
  x: z.boolean().default(false),
  y: z.boolean().default(false),
  z: z.boolean().default(false),
  space: z.enum(['local', 'world']).default('local'),
});
export type SculptSymmetry = z.infer<typeof SculptSymmetrySchema>;

export const NO_SYMMETRY: SculptSymmetry = { x: false, y: false, z: false, space: 'local' };

/** One mirrored copy: which axes it flips (a bit per axis, x = 1, y = 2, z = 4; 0 is the original). */
export type MirroredDab = { flip: number; center: V3; normal?: V3; tangent?: V3; view?: V3 };

const flipV = (v: V3, flip: number): V3 => [flip & 1 ? -v[0] : v[0], flip & 2 ? -v[1] : v[1], flip & 4 ? -v[2] : v[2]];

/** The flip masks the enabled axes produce, the original (0) first. */
export function symmetryFlips(sym: SculptSymmetry): number[] {
  const axes = (sym.x ? 1 : 0) | (sym.y ? 2 : 0) | (sym.z ? 4 : 0);
  const out: number[] = [];
  for (let flip = 0; flip < 8; flip += 1) if ((flip & ~axes) === 0) out.push(flip);
  return out;
}

/**
 * Mirrors a vector field value (a point when `point`, else a direction) by `flip`, in local space or
 * through `toWorld` and back.
 */
export function mirrorIn(value: V3, flip: number, space: SculptSymmetry['space'], toWorld: Mat4 | undefined, point: boolean): V3 {
  if (flip === 0) return value;
  if (space === 'local' || !toWorld) return flipV(value, flip);
  const fromWorld = invert(toWorld);
  const world = point ? applyPoint(toWorld, value) : applyDirection(toWorld, value);
  const mirrored = flipV(world as V3, flip);
  return (point ? applyPoint(fromWorld, mirrored) : applyDirection(fromWorld, mirrored)) as V3;
}

/**
 * Every copy of a dab under `sym`. A copy whose centre lands on the original's (a dab exactly on the
 * mirror plane) is dropped, so a stroke down the middle is not applied twice.
 */
export function mirrorDab(dab: Omit<MirroredDab, 'flip'>, sym: SculptSymmetry, toWorld?: Mat4, radius = 0): MirroredDab[] {
  const out: MirroredDab[] = [];
  const eps = Math.max(1e-9, radius * 1e-6);
  for (const flip of symmetryFlips(sym)) {
    const center = mirrorIn(dab.center, flip, sym.space, toWorld, true);
    if (flip !== 0 && out.some((d) => Math.hypot(d.center[0] - center[0], d.center[1] - center[1], d.center[2] - center[2]) <= eps)) continue;
    out.push({
      flip,
      center,
      ...(dab.normal ? { normal: mirrorIn(dab.normal, flip, sym.space, toWorld, false) } : {}),
      ...(dab.tangent ? { tangent: mirrorIn(dab.tangent, flip, sym.space, toWorld, false) } : {}),
      ...(dab.view ? { view: mirrorIn(dab.view, flip, sym.space, toWorld, false) } : {}),
    });
  }
  return out;
}
