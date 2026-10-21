/**
 * OSM road ways → the capture's road graph and its raster mask (Phase 108 Theme E). Pure and
 * dependency-free: main runs it on an Overpass response, the tests run it on a committed fixture.
 * Output is in Terrain's centred frame — `x` east, `z` south, metres — via the azimuthal-equidistant
 * `toFrame`, so a road lands where the heightmap's same coordinate does.
 */
import { toFrame } from './frame';
import type { LonLat } from './geodesy';

export const OSM_ROAD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service', 'track', 'path'] as const;
export type OsmRoadClass = (typeof OSM_ROAD_CLASSES)[number];

/** Default carriageway width per class, metres. */
export const OSM_ROAD_WIDTH_M: Readonly<Record<OsmRoadClass, number>> = {
  motorway: 24,
  trunk: 20,
  primary: 14,
  secondary: 12,
  tertiary: 10,
  unclassified: 7,
  residential: 7,
  service: 4,
  track: 3,
  path: 2,
};

const PATHS = new Set(['footway', 'cycleway', 'bridleway', 'steps', 'path']);

/** The Overpass `highway` filter — the classes above plus `*_link`, foot and cycle ways. */
export const OSM_HIGHWAY_FILTER =
  '^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|track|path|footway|cycleway|bridleway|steps)(_link)?$';

/** `*_link` folds into its parent class; foot/cycle/bridle ways and steps fold into `path`. */
export function classifyHighway(highway: string | undefined): OsmRoadClass | null {
  if (!highway) return null;
  const base = highway.replace(/_link$/, '');
  if (PATHS.has(base)) return 'path';
  return (OSM_ROAD_CLASSES as readonly string[]).includes(base) ? (base as OsmRoadClass) : null;
}

/** `lanes × 3.5` when `lanes` parses as a positive integer, else the class width. */
export function roadWidthM(cls: OsmRoadClass, lanes?: number): number {
  return lanes !== undefined && Number.isInteger(lanes) && lanes > 0 ? lanes * 3.5 : OSM_ROAD_WIDTH_M[cls];
}

export type OsmElement =
  | { type: 'node'; id: number; lat: number; lon: number }
  | { type: 'way'; id: number; nodes: number[]; tags?: Record<string, string> }
  | { type: string; id?: number };
export interface OsmResponse {
  elements?: OsmElement[];
}

export interface RoadGraph {
  version: 1;
  worldSize: number;
  nodes: { id: number; p: [number, number] }[];
  edges: {
    id: number;
    a: number;
    b: number;
    points: [number, number][];
    cls: OsmRoadClass;
    name?: string;
    lanes?: number;
    widthM: number;
    osmWayId: number;
  }[];
}

type P = [number, number];

/** Liang–Barsky: the part of segment p→q inside `[-h, h]²`, or null. */
function clipSegment(p: P, q: P, h: number): { a: P; b: P; aIn: boolean; bIn: boolean } | null {
  const dx = q[0] - p[0];
  const dz = q[1] - p[1];
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, p[0] + h],
    [dx, h - p[0]],
    [-dz, p[1] + h],
    [dz, h - p[1]],
  ];
  for (const [pk, qk] of edges) {
    if (pk === 0) {
      if (qk < 0) return null;
    } else {
      const r = qk / pk;
      if (pk < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  const at = (t: number): P => [
    t === 0 ? p[0] : t === 1 ? q[0] : Math.max(-h, Math.min(h, p[0] + dx * t)),
    t === 0 ? p[1] : t === 1 ? q[1] : Math.max(-h, Math.min(h, p[1] + dz * t)),
  ];
  return { a: at(t0), b: at(t1), aIn: t0 === 0, bIn: t1 === 1 };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Nodes = way endpoints plus OSM nodes used by ≥ 2 ways (or twice by one); ways are split there, each
 * piece is clipped to the square (a boundary crossing inserts a node) and projected with `toFrame`;
 * pieces shorter than 1 m are dropped. Ids are dense and deterministic.
 */
export function osmToRoadGraph(osm: OsmResponse, center: LonLat, sideM: number): RoadGraph {
  const h = sideM / 2;
  const coords = new Map<number, P>();
  const ways: { id: number; nodes: number[]; cls: OsmRoadClass; name?: string; lanes?: number }[] = [];
  for (const el of osm.elements ?? []) {
    if (el.type === 'node') {
      const n = el as { id: number; lat: number; lon: number };
      coords.set(n.id, toFrame(center, [n.lon, n.lat]));
    }
  }
  for (const el of osm.elements ?? []) {
    if (el.type !== 'way') continue;
    const w = el as { id: number; nodes: number[]; tags?: Record<string, string> };
    const cls = classifyHighway(w.tags?.['highway']);
    if (!cls || !Array.isArray(w.nodes) || w.nodes.length < 2) continue;
    const lanes = Number(w.tags?.['lanes']);
    const name = w.tags?.['name'];
    ways.push({
      id: w.id,
      nodes: w.nodes,
      cls,
      ...(name ? { name } : {}),
      ...(Number.isInteger(lanes) && lanes > 0 ? { lanes } : {}),
    });
  }
  ways.sort((a, b) => a.id - b.id);

  const uses = new Map<number, number>();
  for (const w of ways) for (const n of w.nodes) uses.set(n, (uses.get(n) ?? 0) + 1);

  const nodeIds = new Map<string, number>();
  const nodes: RoadGraph['nodes'] = [];
  const edges: RoadGraph['edges'] = [];
  const nodeFor = (key: string, p: P): number => {
    let id = nodeIds.get(key);
    if (id === undefined) {
      id = nodes.length;
      nodeIds.set(key, id);
      nodes.push({ id, p: [round3(p[0]), round3(p[1])] });
    }
    return id;
  };

  for (const w of ways) {
    // Split into pieces at junction nodes.
    let seg: number[] = [];
    const pieces: number[][] = [];
    w.nodes.forEach((n, i) => {
      seg.push(n);
      if (i > 0 && i < w.nodes.length - 1 && (uses.get(n) ?? 0) >= 2) {
        pieces.push(seg);
        seg = [n];
      }
    });
    pieces.push(seg);

    for (const piece of pieces) {
      if (piece.some((n) => !coords.has(n))) continue; // a node Overpass did not return
      const pts = piece.map((n) => coords.get(n)!);
      type Run = { pts: P[]; startKey: string; endKey: string | null };
      const runs: Run[] = [];
      let cur: Run | null = null;
      for (let i = 0; i + 1 < pts.length; i += 1) {
        const c = clipSegment(pts[i]!, pts[i + 1]!, h);
        if (!c) {
          cur = null;
          continue;
        }
        if (!cur || !c.aIn) {
          cur = { pts: [c.a], startKey: c.aIn ? `n${piece[i]}` : `b${round3(c.a[0])},${round3(c.a[1])}`, endKey: null };
          runs.push(cur);
        }
        cur.pts.push(c.b);
        cur.endKey = c.bIn ? (i + 1 === pts.length - 1 ? `n${piece[i + 1]}` : null) : `b${round3(c.b[0])},${round3(c.b[1])}`;
        if (!c.bIn) cur = null;
      }
      for (const run of runs) {
        let len = 0;
        for (let i = 0; i + 1 < run.pts.length; i += 1)
          len += Math.hypot(run.pts[i + 1]![0] - run.pts[i]![0], run.pts[i + 1]![1] - run.pts[i]![1]);
        if (len < 1) continue;
        const first = run.pts[0]!;
        const last = run.pts[run.pts.length - 1]!;
        const a = nodeFor(run.startKey, first);
        const b = nodeFor(run.endKey ?? `n${piece[piece.length - 1]}`, last);
        edges.push({
          id: edges.length,
          a,
          b,
          points: run.pts.map((p) => [round3(p[0]), round3(p[1])] as P),
          cls: w.cls,
          ...(w.name ? { name: w.name } : {}),
          ...(w.lanes ? { lanes: w.lanes } : {}),
          widthM: roadWidthM(w.cls, w.lanes),
          osmWayId: w.id,
        });
      }
    }
  }
  return { version: 1, worldSize: sideM, nodes, edges };
}

/**
 * The graph as an RGBA raster, `size`² pixels, cyan `#00FFFF` roads on black — the colour
 * `detectRoadColour` keys without a hint. Roads are round-capped thick polylines at
 * `widthM / (worldSize / size)` pixels, never thinner than ~1.4 px; pixel-centred like the satellite.
 */
export function rasterizeRoads(graph: Pick<RoadGraph, 'worldSize' | 'edges'>, size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  const scale = size / graph.worldSize;
  const half = graph.worldSize / 2;
  for (const e of graph.edges) {
    const r = Math.max(0.7, (e.widthM * scale) / 2);
    const px = e.points.map(([x, z]) => [(x + half) * scale, (z + half) * scale] as P);
    for (let k = 0; k + 1 < px.length; k += 1) {
      const [ax, ay] = px[k]!;
      const [bx, by] = px[k + 1]!;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 0.5));
      const x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx) + r - 0.5));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r - 0.5));
      const y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by) + r - 0.5));
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const cx = x + 0.5;
          const cy = y + 0.5;
          const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / len2));
          if (Math.hypot(cx - (ax + dx * t), cy - (ay + dy * t)) <= r) {
            const o = (y * size + x) * 4;
            out[o] = 0;
            out[o + 1] = 255;
            out[o + 2] = 255;
          }
        }
      }
    }
  }
  return out;
}
