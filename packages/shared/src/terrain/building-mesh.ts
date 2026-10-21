/**
 * Flat-roofed block buildings (Phase 105 Theme G): each footprint polygon is extruded from just
 * below its `baseY` (so it never floats on a blended edge) to `baseY + height`, with a roof
 * ear-clipped by the Models kernel's `triangulatePolygon`. All buildings merge into one flat-shaded mesh with per-vertex colour — one draw call.
 */
import type { TerrainBuilding } from '../media-terrain';
import { triangulatePolygon } from '../model-geometry/raw';

/** How far walls sink below `baseY`, metres. */
export const BUILDING_SINK_M = 1;
export const BUILDING_WALL_RGB: readonly [number, number, number] = [0.82, 0.8, 0.76];
export const BUILDING_ROOF_RGB: readonly [number, number, number] = [0.45, 0.43, 0.42];

export type BuildingsMesh = { positions: Float32Array; normals: Float32Array; colors: Float32Array; indices: Uint32Array };

type Xz = [number, number];

const cross2 = (o: Xz, a: Xz, b: Xz): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Every building extruded and merged. Faces are wound counter-clockwise seen from outside. */
export function buildingsMesh(buildings: readonly TerrainBuilding[]): BuildingsMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const vertex = (p: readonly number[], nrm: readonly number[], rgb: readonly number[]): number => {
    positions.push(...p);
    normals.push(...nrm);
    colors.push(...rgb);
    return positions.length / 3 - 1;
  };
  /** Pushes a triangle, swapping two corners when its geometric normal opposes `outward`. */
  const tri = (a: number, b: number, c: number, outward: readonly number[]): void => {
    const p = (i: number): number[] => positions.slice(i * 3, i * 3 + 3);
    const [ax, ay, az] = p(a);
    const [bx, by, bz] = p(b);
    const [cx, cy, cz] = p(c);
    const u = [bx! - ax!, by! - ay!, bz! - az!];
    const v = [cx! - ax!, cy! - ay!, cz! - az!];
    const nx = u[1]! * v[2]! - u[2]! * v[1]!;
    const ny = u[2]! * v[0]! - u[0]! * v[2]!;
    const nz = u[0]! * v[1]! - u[1]! * v[0]!;
    if (nx * outward[0]! + ny * outward[1]! + nz * outward[2]! < 0) indices.push(a, c, b);
    else indices.push(a, b, c);
  };

  for (const building of buildings) {
    const poly = building.polygon;
    if (poly.length < 3) continue;
    const bottom = building.baseY - BUILDING_SINK_M;
    const top = building.baseY + building.height;
    let area = 0;
    for (let i = 0; i < poly.length; i += 1) area += cross2([0, 0], poly[i]!, poly[(i + 1) % poly.length]!);
    const sign = area >= 0 ? 1 : -1;

    for (let i = 0; i < poly.length; i += 1) {
      const [ax, az] = poly[i]!;
      const [bx, bz] = poly[(i + 1) % poly.length]!;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-6) continue;
      // Outward normal of a positively wound (x, z) polygon is (dz, −dx); flip for the other winding.
      const out = [(sign * (bz - az)) / len, 0, (-sign * (bx - ax)) / len];
      const v0 = vertex([ax, bottom, az], out, BUILDING_WALL_RGB);
      const v1 = vertex([bx, bottom, bz], out, BUILDING_WALL_RGB);
      const v2 = vertex([bx, top, bz], out, BUILDING_WALL_RGB);
      const v3 = vertex([ax, top, az], out, BUILDING_WALL_RGB);
      tri(v0, v1, v2, out);
      tri(v0, v2, v3, out);
    }

    const up = [0, 1, 0];
    const base = positions.length / 3;
    for (const [x, z] of poly) vertex([x, top, z], up, BUILDING_ROOF_RGB);
    for (const [a, b, c] of triangulatePolygon(poly)) tri(base + a, base + b, base + c, up);
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
  };
}
