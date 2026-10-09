/**
 * OSM building ways → the capture's building footprints (Map capture ▸ Buildings). Pure and
 * dependency-free, like `osm-roads.ts`: main runs it on an Overpass response, the tests on a fixture.
 * Output is in Terrain's centred frame — `x` east, `z` south, metres — so a footprint lands where the
 * heightmap's same coordinate does. Heights come from OSM tags where present (`height`, else
 * `building:levels` × 3 m); `minHeightM` carries `min_height` / `building:min_level` for parts that
 * float (bridges, overhangs). Multipolygon relations are skipped: only closed building ways are read.
 */
import { toFrame } from './frame';
import type { LonLat } from './geodesy';
import type { OsmResponse } from './osm-roads';

export const OSM_BUILDING_LEVEL_M = 3;
/** Footprints under this area (m²) are dropped as mapping noise (sheds, kiosks). */
export const OSM_BUILDING_MIN_AREA_M2 = 4;

export interface BuildingFootprint {
  /** The OSM way id. */
  id: number;
  /** Closed ring, no repeated last point, wound with a positive signed area in (x, z). */
  polygon: [number, number][];
  /** Roof height above the ground, metres, when OSM states or implies it. */
  heightM?: number;
  /** Height of the underside above the ground, metres (> 0 for floating parts). */
  minHeightM?: number;
}

export interface BuildingsFile {
  version: 1;
  worldSize: number;
  buildings: BuildingFootprint[];
}

/** `"12"`, `"12.5 m"`, `"12,5"` → metres; feet (`"40 ft"`) convert; anything else is undefined. */
export function parseOsmLength(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(m|ft|')?\s*$/i.exec(value);
  if (!m) return undefined;
  const n = Number(m[1]!.replace(',', '.'));
  if (!Number.isFinite(n)) return undefined;
  return m[2] && m[2].toLowerCase() !== 'm' ? n * 0.3048 : n;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function areaOf(poly: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [x0, z0] = poly[i]!;
    const [x1, z1] = poly[(i + 1) % poly.length]!;
    a += x0 * z1 - x1 * z0;
  }
  return a / 2;
}

export function osmToBuildings(osm: OsmResponse, center: LonLat, sideM: number): BuildingsFile {
  const h = sideM / 2;
  const coords = new Map<number, [number, number]>();
  for (const el of osm.elements ?? []) {
    if (el.type === 'node') {
      const n = el as { id: number; lat: number; lon: number };
      coords.set(n.id, toFrame(center, [n.lon, n.lat]));
    }
  }
  const buildings: BuildingFootprint[] = [];
  for (const el of osm.elements ?? []) {
    if (el.type !== 'way') continue;
    const w = el as { id: number; nodes: number[]; tags?: Record<string, string> };
    const building = w.tags?.['building'];
    if (!building || building === 'no' || !Array.isArray(w.nodes) || w.nodes.length < 4) continue;
    if (w.nodes[0] !== w.nodes[w.nodes.length - 1]) continue; // an unclosed way is not a footprint
    const ring = w.nodes.slice(0, -1).map((n) => coords.get(n));
    if (ring.some((p) => !p)) continue; // a node Overpass did not return
    let polygon = ring as [number, number][];
    // A building belongs to the frame by its centroid; its edge is clamped to the square.
    const cx = polygon.reduce((s, p) => s + p[0], 0) / polygon.length;
    const cz = polygon.reduce((s, p) => s + p[1], 0) / polygon.length;
    if (Math.abs(cx) > h || Math.abs(cz) > h) continue;
    polygon = polygon.map(([x, z]) => [round2(Math.max(-h, Math.min(h, x))), round2(Math.max(-h, Math.min(h, z)))]);
    let area = areaOf(polygon);
    if (Math.abs(area) < OSM_BUILDING_MIN_AREA_M2) continue;
    if (area < 0) {
      polygon.reverse();
      area = -area;
    }
    const tags = w.tags ?? {};
    const levels = Number(tags['building:levels']);
    const minLevel = Number(tags['building:min_level']);
    const heightM = parseOsmLength(tags['height']) ?? (Number.isFinite(levels) && levels > 0 ? levels * OSM_BUILDING_LEVEL_M : undefined);
    const minHeightM = parseOsmLength(tags['min_height']) ?? (Number.isFinite(minLevel) && minLevel > 0 ? minLevel * OSM_BUILDING_LEVEL_M : undefined);
    buildings.push({
      id: w.id,
      polygon,
      ...(heightM !== undefined && heightM > 0 ? { heightM: round2(heightM) } : {}),
      ...(minHeightM !== undefined && minHeightM > 0 && (heightM === undefined || minHeightM < heightM) ? { minHeightM: round2(minHeightM) } : {}),
    });
  }
  buildings.sort((a, b) => a.id - b.id);
  return { version: 1, worldSize: sideM, buildings };
}
