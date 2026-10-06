/**
 * Skeleton → road graph (Phase 105 Theme H). Nodes sit at junctions and endpoints of the thinned
 * mask; edges are the pixel chains between them, carried in world metres `(x, z)` (terrain centred
 * on the origin) together with the distance-transform radii sampled along them, which become the
 * edge's width. Then: prune spurs, merge near-duplicate nodes, fit centripetal Catmull-Rom splines.
 */
import type { TerrainRoadsFile } from '../media-terrain';
import { pixelToWorld, sampleHeight } from './field-sample';
import type { Heightfield } from './heightfield';
import { distanceTransform } from './morphology';
import { cleanRoadMask } from './road-mask';
import { neighbourCount, removeStaircases, zhangSuen } from './skeleton';

export type RoadNode = { id: number; x: number; z: number };
export type RoadEdge = {
  id: number;
  a: number;
  b: number;
  /** Centreline in world metres, `path[0]` at node `a`, the last point at node `b`. */
  path: [number, number][];
  /** Distance to the mask's edge along the centreline, in metres (from the distance transform). */
  radii: number[];
};
export type RoadGraph = { nodes: RoadNode[]; edges: RoadEdge[] };

/** Width thresholds for `kind`, metres: below 4 a path, below 10 a street, else an avenue. */
export const ROAD_KIND_THRESHOLDS = { path: 4, street: 10 } as const;
export const roadKind = (widthM: number): 'path' | 'street' | 'avenue' =>
  widthM < ROAD_KIND_THRESHOLDS.path ? 'path' : widthM < ROAD_KIND_THRESHOLDS.street ? 'street' : 'avenue';

// 4-neighbours first, so a staircase is walked pixel by pixel rather than cut across its corner.
const STEP_ORDER: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];

/**
 * Walks a one-pixel skeleton into a graph. `dist` (the mask's distance transform, in pixels) fills
 * each edge's `radii`; without it the radii are empty. A closed ring with no junction becomes one
 * node and a self-loop edge.
 */
export function skeletonToGraph(
  skel: Uint8Array,
  w: number,
  h: number,
  opts: { worldSize: number; dist?: Float32Array },
): RoadGraph {
  skel = removeStaircases(skel, w, h);
  const mPerPx = opts.worldSize / w;
  const on = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && skel[y * w + x]! > 0;
  const nodeOf = new Int32Array(w * h).fill(-1);
  const visited = new Uint8Array(w * h);
  const nodes: RoadNode[] = [];
  const nodePixels: number[][] = [];

  // 1. Node pixels: endpoints (one neighbour) and junctions (three or more), the latter grouped
  //    into 8-connected clusters so a fat crossing is one node at the cluster's centroid.
  const isJunction = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (!skel[i]) continue;
      const n = neighbourCount(skel, w, h, x, y);
      if (n === 0) continue;
      if (n === 1) {
        addNode([i]);
      } else if (n >= 3) {
        isJunction[i] = 1;
      }
    }
  }
  for (let i = 0; i < w * h; i += 1) {
    if (!isJunction[i] || nodeOf[i]! >= 0) continue;
    const cluster: number[] = [];
    const stack = [i];
    nodeOf[i] = -2;
    while (stack.length > 0) {
      const p = stack.pop()!;
      cluster.push(p);
      const px = p % w;
      const py = (p - px) / w;
      for (const [dx, dy] of STEP_ORDER) {
        const q = (py + dy) * w + px + dx;
        if (on(px + dx, py + dy) && isJunction[q] && nodeOf[q] === -1) {
          nodeOf[q] = -2;
          stack.push(q);
        }
      }
    }
    addNode(cluster);
  }

  function addNode(pixels: number[]): number {
    const id = nodes.length;
    let sx = 0;
    let sy = 0;
    for (const p of pixels) {
      nodeOf[p] = id;
      visited[p] = 1;
      sx += p % w;
      sy += Math.floor(p / w);
    }
    const [x, z] = pixelToWorld(sx / pixels.length, sy / pixels.length, w, opts.worldSize);
    nodes.push({ id, x, z });
    nodePixels.push(pixels);
    return id;
  }

  const edges: RoadEdge[] = [];
  const directPairs = new Set<string>();
  const radius = (p: number): number => (opts.dist ? opts.dist[p]! * mPerPx : 0);

  function trace(start: number, from: number, first: number): void {
    const chain = [from, first];
    visited[first] = 1;
    let prev = from;
    let cur = first;
    let end = -1;
    for (;;) {
      const cx = cur % w;
      const cy = (cur - cx) / w;
      // A node pixel next door ends the edge — but not the one we left, until the chain has length.
      let next = -1;
      for (const [dx, dy] of STEP_ORDER) {
        if (!on(cx + dx, cy + dy)) continue;
        const q = (cy + dy) * w + cx + dx;
        const node = nodeOf[q]!;
        if (node >= 0 && q !== prev && (node !== start || chain.length > 3)) {
          end = node;
          next = q;
          break;
        }
      }
      if (end >= 0) {
        chain.push(next);
        break;
      }
      for (const [dx, dy] of STEP_ORDER) {
        if (!on(cx + dx, cy + dy)) continue;
        const q = (cy + dy) * w + cx + dx;
        if (!visited[q] && nodeOf[q]! < 0) {
          next = q;
          break;
        }
      }
      if (next < 0) {
        // A dead end that was not an endpoint (it met already-walked pixels): it becomes one.
        end = addNode([cur]);
        break;
      }
      visited[next] = 1;
      chain.push(next);
      prev = cur;
      cur = next;
    }
    pushEdge(start, end, chain);
  }

  function pushEdge(a: number, b: number, chain: number[]): void {
    const path = chain.map((p) => pixelToWorld(p % w, Math.floor(p / w), w, opts.worldSize));
    const na = nodes[a]!;
    const nb = nodes[b]!;
    path[0] = [na.x, na.z];
    path[path.length - 1] = [nb.x, nb.z];
    const interior = chain.filter((p) => nodeOf[p]! < 0);
    edges.push({ id: edges.length, a, b, path, radii: (interior.length > 0 ? interior : chain).map(radius) });
  }

  const walkFrom = (id: number): void => {
    for (const p of nodePixels[id]!) {
      const px = p % w;
      const py = (p - px) / w;
      for (const [dx, dy] of STEP_ORDER) {
        if (!on(px + dx, py + dy)) continue;
        const q = (py + dy) * w + px + dx;
        const other = nodeOf[q]!;
        if (other === id) continue;
        if (other >= 0) {
          const key = id < other ? `${id}:${other}` : `${other}:${id}`;
          if (!directPairs.has(key)) {
            directPairs.add(key);
            pushEdge(id, other, [p, q]);
          }
        } else if (!visited[q]) {
          trace(id, p, q);
        }
      }
    }
  };

  // Nodes appended while walking (dead ends) have nothing left to walk, so a fixed count is enough.
  const initial = nodes.length;
  for (let id = 0; id < initial; id += 1) walkFrom(id);

  // 2. Whatever is left is closed rings: seed a node on each and walk it round.
  for (let i = 0; i < w * h; i += 1) {
    if (!skel[i] || visited[i] || neighbourCount(skel, w, h, i % w, Math.floor(i / w)) === 0) continue;
    walkFrom(addNode([i]));
  }

  return { nodes, edges };
}

/** Polyline length in metres over `(x, z)`. */
export function pathLength(path: readonly (readonly number[])[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1]!;
    const b = path[i]!;
    len += Math.hypot(b[0]! - a[0]!, b[b.length - 1]! - a[a.length - 1]!);
  }
  return len;
}

const degrees = (g: RoadGraph): Map<number, number> => {
  const deg = new Map<number, number>(g.nodes.map((n) => [n.id, 0]));
  for (const e of g.edges) {
    deg.set(e.a, (deg.get(e.a) ?? 0) + 1);
    deg.set(e.b, (deg.get(e.b) ?? 0) + 1);
  }
  return deg;
};

/** Drops nodes no edge touches. */
function dropIsolated(g: RoadGraph): RoadGraph {
  const deg = degrees(g);
  return { nodes: g.nodes.filter((n) => (deg.get(n.id) ?? 0) > 0), edges: g.edges };
}

/** Joins the two edges through every degree-2 node into one, removing the node. */
export function joinDegree2(graph: RoadGraph): RoadGraph {
  let nodes = [...graph.nodes];
  let edges = graph.edges.map((e) => ({ ...e }));
  let changed = true;
  while (changed) {
    changed = false;
    const deg = degrees({ nodes, edges });
    for (const node of nodes) {
      if (deg.get(node.id) !== 2) continue;
      const incident = edges.filter((e) => e.a === node.id || e.b === node.id);
      if (incident.length !== 2) continue; // a self-loop counts twice on one edge
      const [e1, e2] = incident as [RoadEdge, RoadEdge];
      const p1 = e1.b === node.id ? e1.path : [...e1.path].reverse();
      const r1 = e1.b === node.id ? e1.radii : [...e1.radii].reverse();
      const p2 = e2.a === node.id ? e2.path : [...e2.path].reverse();
      const r2 = e2.a === node.id ? e2.radii : [...e2.radii].reverse();
      const a = e1.b === node.id ? e1.a : e1.b;
      const b = e2.a === node.id ? e2.b : e2.a;
      const joined: RoadEdge = { id: e1.id, a, b, path: [...p1, ...p2.slice(1)], radii: [...r1, ...r2] };
      edges = edges.filter((e) => e !== e1 && e !== e2).concat(joined);
      nodes = nodes.filter((n) => n.id !== node.id);
      changed = true;
      break;
    }
  }
  return { nodes, edges };
}

/**
 * Removes dead-end branches shorter than `minM` that hang off a junction (degree ≥ 3), then joins
 * the edges that removal leaves passing straight through a node. Repeats until nothing changes.
 * An isolated segment (both ends free) is kept whatever its length — the mask clean-up owns specks.
 */
export function pruneSpurs(graph: RoadGraph, minM: number): RoadGraph {
  let g = graph;
  for (;;) {
    const deg = degrees(g);
    const spur = g.edges.find((e) => {
      if (e.a === e.b) return pathLength(e.path) < minM;
      const da = deg.get(e.a) ?? 0;
      const db = deg.get(e.b) ?? 0;
      return ((da === 1 && db >= 3) || (db === 1 && da >= 3)) && pathLength(e.path) < minM;
    });
    if (!spur) break;
    g = joinDegree2(dropIsolated({ nodes: g.nodes, edges: g.edges.filter((e) => e !== spur) }));
  }
  return g;
}

/**
 * Collapses every edge shorter than `epsM` between two distinct nodes into a single node at their
 * midpoint (the skeleton's habit of splitting one crossing into two close junctions), then joins
 * degree-2 pass-throughs.
 */
export function mergeNodes(graph: RoadGraph, epsM = 3): RoadGraph {
  let nodes = graph.nodes.map((n) => ({ ...n }));
  let edges = graph.edges.map((e) => ({ ...e }));
  for (;;) {
    const short = edges.find((e) => e.a !== e.b && pathLength(e.path) < epsM);
    if (!short) break;
    const keep = nodes.find((n) => n.id === short.a)!;
    const gone = nodes.find((n) => n.id === short.b)!;
    keep.x = (keep.x + gone.x) / 2;
    keep.z = (keep.z + gone.z) / 2;
    edges = edges
      .filter((e) => e !== short)
      .map((e) => ({ ...e, a: e.a === gone.id ? keep.id : e.a, b: e.b === gone.id ? keep.id : e.b }))
      // A loop the collapse just closed on itself is the crossing's own interior, not a road.
      .filter((e) => !(e.a === e.b && pathLength(e.path) < epsM * 2));
    nodes = nodes.filter((n) => n.id !== gone.id);
    for (const e of edges) {
      if (e.a === keep.id) e.path = [[keep.x, keep.z], ...e.path.slice(1)];
      if (e.b === keep.id) e.path = [...e.path.slice(0, -1), [keep.x, keep.z]];
    }
  }
  return joinDegree2({ nodes, edges });
}

/** Douglas–Peucker on an open polyline. */
export function simplifyPolyline(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length <= 2) return points;
  const [x1, z1] = points[0]!;
  const [x2, z2] = points[points.length - 1]!;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  let max = -1;
  let index = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const [px, pz] = points[i]!;
    const d = len === 0 ? Math.hypot(px - x1, pz - z1) : Math.abs(dz * px - dx * pz + x2 * z1 - z2 * x1) / len;
    if (d > max) {
      max = d;
      index = i;
    }
  }
  if (max <= epsilon) return [points[0]!, points[points.length - 1]!];
  return [...simplifyPolyline(points.slice(0, index + 1), epsilon).slice(0, -1), ...simplifyPolyline(points.slice(index), epsilon)];
}

/**
 * Samples a centripetal (α = 0.5) Catmull-Rom spline through `points` roughly every `spacing`
 * metres, always keeping both ends. Works on 2-D or 3-D points; distance is measured on all axes.
 */
export function sampleCatmullRom<T extends number[]>(points: T[], spacing: number): T[] {
  if (points.length < 2) return points.map((p) => [...p] as T);
  const dim = points[0]!.length;
  const ext = [
    points[0]!.map((v, k) => 2 * v - points[1]![k]!) as T,
    ...points,
    points[points.length - 1]!.map((v, k) => 2 * v - points[points.length - 2]![k]!) as T,
  ];
  const dist = (a: T, b: T): number => Math.sqrt(a.reduce((s, v, k) => s + (v - b[k]!) ** 2, 0));
  const out: T[] = [[...points[0]!] as T];
  for (let i = 1; i < ext.length - 2; i += 1) {
    const p0 = ext[i - 1]!;
    const p1 = ext[i]!;
    const p2 = ext[i + 1]!;
    const p3 = ext[i + 2]!;
    const t0 = 0;
    const t1 = t0 + Math.max(1e-6, Math.sqrt(dist(p0, p1)));
    const t2 = t1 + Math.max(1e-6, Math.sqrt(dist(p1, p2)));
    const t3 = t2 + Math.max(1e-6, Math.sqrt(dist(p2, p3)));
    const steps = Math.max(1, Math.ceil(dist(p1, p2) / spacing));
    for (let s = 1; s <= steps; s += 1) {
      if (s === steps) {
        out.push([...p2] as T);
        break;
      }
      const t = t1 + ((t2 - t1) * s) / steps;
      const point = new Array<number>(dim);
      for (let k = 0; k < dim; k += 1) {
        const a1 = ((t1 - t) / (t1 - t0)) * p0[k]! + ((t - t0) / (t1 - t0)) * p1[k]!;
        const a2 = ((t2 - t) / (t2 - t1)) * p1[k]! + ((t - t1) / (t2 - t1)) * p2[k]!;
        const a3 = ((t3 - t) / (t3 - t2)) * p2[k]! + ((t - t2) / (t3 - t2)) * p3[k]!;
        const b1 = ((t2 - t) / (t2 - t0)) * a1 + ((t - t0) / (t2 - t0)) * a2;
        const b2 = ((t3 - t) / (t3 - t1)) * a2 + ((t - t1) / (t3 - t1)) * a3;
        point[k] = ((t2 - t) / (t2 - t1)) * b1 + ((t - t1) / (t2 - t1)) * b2;
      }
      out.push(point as T);
    }
  }
  return out;
}

/**
 * Replaces each edge's pixel chain with spline control points: Douglas–Peucker at `simplifyM`
 * (one pixel), then a centripetal Catmull-Rom sampled every ~`spacingM` (10 m) metres.
 */
export function fitSplines(graph: RoadGraph, opts: { simplifyM: number; spacingM?: number }): RoadGraph {
  const spacing = opts.spacingM ?? 10;
  return {
    nodes: graph.nodes,
    edges: graph.edges.map((e) => ({ ...e, path: sampleCatmullRom(simplifyPolyline(e.path, opts.simplifyM), spacing) })),
  };
}

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/**
 * Width from the distance transform: twice the median centreline radius, less half a pixel (the
 * transform measures to the first background pixel's centre), × `widthScale`, clamped.
 */
export function edgeWidth(edge: RoadEdge, opts: { mPerPx: number; widthScale: number; widthClampM: readonly [number, number] }): number {
  const raw = Math.max(opts.mPerPx, 2 * median(edge.radii) - 0.5 * opts.mPerPx);
  return Math.min(opts.widthClampM[1], Math.max(opts.widthClampM[0], raw * opts.widthScale));
}

/** The on-disk road graph: ids renumbered densely, heights read off the (conformed) field. */
export function toRoadsFile(
  graph: RoadGraph,
  field: Heightfield,
  opts: { mPerPx: number; widthScale: number; widthClampM: readonly [number, number] },
): TerrainRoadsFile {
  const deg = degrees(graph);
  const ids = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const round = (v: number): number => Math.round(v * 100) / 100;
  return {
    version: 1,
    nodes: graph.nodes.map((n, i) => ({ id: i, p: [round(n.x), round(sampleHeight(field, n.x, n.z)), round(n.z)], degree: deg.get(n.id) ?? 0 })),
    edges: graph.edges.map((e, i) => {
      const widthM = round(edgeWidth(e, opts));
      return {
        id: i,
        a: ids.get(e.a)!,
        b: ids.get(e.b)!,
        points: e.path.map(([x, z]) => [round(x), round(sampleHeight(field, x, z)), round(z)] as [number, number, number]),
        widthM,
        kind: roadKind(widthM),
        lengthM: round(pathLength(e.path)),
      };
    }),
  };
}

/** Within this distance two graph nodes are one crossing, metres. */
export const ROAD_NODE_MERGE_M = 3;

/**
 * The whole mask → graph chain, as the build runs it: clean the mask (components smaller than the
 * shortest allowed spur at the narrowest allowed width are specks), distance transform, Zhang–Suen,
 * walk, prune spurs, merge near-duplicate nodes, fit splines. `res` is the mask's side in pixels.
 */
export function roadGraphFromMask(
  rawMask: Uint8Array,
  res: number,
  opts: { worldSize: number; spurMinM: number; widthClampM: readonly [number, number] },
): { graph: RoadGraph; mask: Uint8Array; mPerPx: number } {
  const mPerPx = opts.worldSize / res;
  const minPixels = Math.round((opts.spurMinM / mPerPx) * Math.max(1, opts.widthClampM[0] / mPerPx));
  const mask = cleanRoadMask(rawMask, res, res, minPixels);
  const dist = distanceTransform(mask, res, res);
  const skel = zhangSuen(mask, res, res);
  let graph = skeletonToGraph(skel, res, res, { worldSize: opts.worldSize, dist });
  graph = pruneSpurs(graph, opts.spurMinM);
  graph = mergeNodes(graph, ROAD_NODE_MERGE_M);
  graph = pruneSpurs(graph, opts.spurMinM);
  graph = fitSplines(graph, { simplifyM: mPerPx });
  return { graph, mask, mPerPx };
}
