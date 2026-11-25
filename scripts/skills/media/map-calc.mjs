#!/usr/bin/env node
// `--no-llm` is accepted as a documented no-op: this script never calls an LLM, so a skill step can add it everywhere.
// Map capture math (Phase 151 Theme E): sideM bounds, power-of-2+1 grid sizes, metres per pixel, per-layer limits.
//
//   node scripts/skills/media/map-calc.mjs --side 4000 [--size 513] [--target-mpp 10] [--json]
import { fileURLToPath } from 'node:url';

export const SIZES = [129, 257, 513, 1025, 2049, 4097];
export const SIDE_MIN = 16;
export const SIDE_MAX = 65536;
export const ROADS_MAX_SIDE = 25000;
export const BUILDINGS_MAX_SIDE = 10000;
export const BEST_MPP = 10; // elevation data's own detail: finer is interpolation

/** True for 2^n + 1 (129, 257, ...). */
export const isGridSize = (n) => Number.isInteger(n) && n > 2 && Number.isInteger(Math.log2(n - 1));
export const metresPerPixel = (sideM, size) => sideM / (size - 1);

/** Pick the smallest grid whose resolution reaches `targetMpp` (default ~10 m); the largest size if none does. */
export function recommendSize(sideM, targetMpp = BEST_MPP) {
  return SIZES.find((s) => metresPerPixel(sideM, s) <= targetMpp) ?? SIZES[SIZES.length - 1];
}

/** Everything the skill asks you to check before `map_capture_terrain`. */
export function plan(sideM, { size, targetMpp = BEST_MPP } = {}) {
  const warnings = [];
  const errors = [];
  if (!(sideM >= SIDE_MIN && sideM <= SIDE_MAX)) errors.push(`sideM must be ${SIDE_MIN}-${SIDE_MAX}`);
  const chosen = size ?? recommendSize(sideM, targetMpp);
  if (!SIZES.includes(chosen)) errors.push(`size must be one of ${SIZES.join(', ')}`);
  const mpp = metresPerPixel(sideM, chosen);
  if (mpp < targetMpp / 2) warnings.push(`${mpp.toFixed(2)} m/px is finer than the elevation data (~${targetMpp} m): extra pixels are interpolation`);
  if (sideM > ROADS_MAX_SIDE) warnings.push(`roads are not captured above ${ROADS_MAX_SIDE} m`);
  if (sideM > BUILDINGS_MAX_SIDE) warnings.push(`buildings are not captured above ${BUILDINGS_MAX_SIDE} m (pass buildings:false)`);
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    sideM,
    size: chosen,
    metresPerPixel: Math.round(mpp * 100) / 100,
    roads: sideM <= ROADS_MAX_SIDE,
    buildings: sideM <= BUILDINGS_MAX_SIDE,
  };
}

/** Great-circle (haversine) distance in metres between two [lon, lat] points — a sanity check, not map_measure's ellipsoid. */
export function haversine([lon1, lat1], [lon2, lat2]) {
  const R = 6371008.8;
  const rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function main(argv = process.argv.slice(2), out = (s) => process.stdout.write(`${s}\n`)) {
  const get = (n) => { const i = argv.indexOf(n); return i >= 0 ? Number(argv[i + 1]) : undefined; };
  const side = get('--side');
  if (!Number.isFinite(side)) return out('usage: map-calc.mjs --side <metres> [--size N] [--target-mpp N] [--json]'), 2;
  const p = plan(side, { size: get('--size'), targetMpp: get('--target-mpp') });
  out(argv.includes('--json') ? JSON.stringify(p) : [`side ${p.sideM} m · size ${p.size} · ${p.metresPerPixel} m/px · roads ${p.roads ? 'yes' : 'no'} · buildings ${p.buildings ? 'yes' : 'no'}`, ...p.errors.map((x) => `error: ${x}`), ...p.warnings.map((x) => `warn: ${x}`)].join('\n'));
  return p.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main();
