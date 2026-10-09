// @ts-check
/**
 * Midnite game kit — routing on a terrain pack's road graph (engine-free).
 *
 * `roads.json` from a Phase 105 terrain export is `{ nodes, edges }`: nodes
 * are junctions and dead ends (`p` = `[x, y, z]`), edges are polylines
 * between two nodes with a `lengthM`. `routeOnRoads` is Dijkstra over those
 * edges by length; `routePolyline` turns a route into the points to drive,
 * each edge's points reversed when it is travelled from `b` to `a`.
 */

/**
 * @typedef {{ id: number, p: number[], degree?: number }} RoadNode
 * @typedef {{ id: number, a: number, b: number, points: number[][], lengthM: number, widthM?: number, kind?: string }} RoadEdge
 * @typedef {{ nodes: RoadNode[], edges: RoadEdge[] }} RoadGraph
 * @typedef {{ nodes: number[], edges: number[], lengthM: number }} Route
 */

/**
 * Shortest route between two node ids, or null when they are not connected.
 * @param {RoadGraph} roads
 * @param {number} from
 * @param {number} to
 * @returns {Route | null}
 */
export function routeOnRoads(roads, from, to) {
  const ids = new Set(roads.nodes.map((n) => n.id));
  if (!ids.has(from) || !ids.has(to)) return null;
  /** @type {Map<number, RoadEdge[]>} */
  const touching = new Map([...ids].map((id) => [id, []]));
  for (const e of roads.edges) {
    touching.get(e.a)?.push(e);
    if (e.b !== e.a) touching.get(e.b)?.push(e);
  }
  /** @type {Map<number, number>} */
  const dist = new Map([[from, 0]]);
  /** @type {Map<number, { node: number, edge: number }>} */
  const prev = new Map();
  const done = new Set();
  // A linear scan for the next node: road graphs from a pack are tens to a few thousand nodes.
  for (;;) {
    let at = -1;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (!done.has(id) && d < best) {
        best = d;
        at = id;
      }
    }
    if (at === -1) return null;
    if (at === to) break;
    done.add(at);
    for (const e of touching.get(at) ?? []) {
      const other = e.a === at ? e.b : e.a;
      const d = best + Math.max(0, e.lengthM);
      if (d < (dist.get(other) ?? Infinity)) {
        dist.set(other, d);
        prev.set(other, { node: at, edge: e.id });
      }
    }
  }
  const nodes = [to];
  const edges = [];
  for (let at = to; at !== from; ) {
    const step = /** @type {{ node: number, edge: number }} */ (prev.get(at));
    edges.unshift(step.edge);
    nodes.unshift(step.node);
    at = step.node;
  }
  return { nodes, edges, lengthM: /** @type {number} */ (dist.get(to)) };
}

/**
 * The node nearest a world point `[x, z]` (on the ground plane).
 * @param {RoadGraph} roads
 * @param {readonly number[]} xz
 */
export function nearestNode(roads, xz) {
  let best = null;
  let bestD = Infinity;
  for (const n of roads.nodes) {
    const d = Math.hypot((n.p[0] ?? 0) - (xz[0] ?? 0), (n.p[2] ?? 0) - (xz[1] ?? 0));
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

/**
 * The points of a route in travel order, `[x, y, z]`, with shared junction
 * points not repeated.
 * @param {RoadGraph} roads
 * @param {Route} route
 */
export function routePolyline(roads, route) {
  const byId = new Map(roads.edges.map((e) => [e.id, e]));
  /** @type {number[][]} */
  const out = [];
  route.edges.forEach((id, i) => {
    const edge = byId.get(id);
    if (!edge) return;
    const forward = edge.a === route.nodes[i];
    const pts = forward ? edge.points : [...edge.points].reverse();
    out.push(...(out.length > 0 ? pts.slice(1) : pts));
  });
  return out;
}

/**
 * Point and heading `s` metres along a polyline (clamped to its ends).
 * @param {readonly (readonly number[])[]} points `[x, y, z]`
 * @param {number} s
 * @returns {{ p: number[], yaw: number, end: boolean }} yaw: 0 faces −z, like the kit's bodies
 */
export function pointAlong(points, s) {
  let left = Math.max(0, s);
  for (let i = 1; i < points.length; i += 1) {
    const a = /** @type {readonly number[]} */ (points[i - 1]);
    const b = /** @type {readonly number[]} */ (points[i]);
    const dx = (b[0] ?? 0) - (a[0] ?? 0);
    const dy = (b[1] ?? 0) - (a[1] ?? 0);
    const dz = (b[2] ?? 0) - (a[2] ?? 0);
    const len = Math.hypot(dx, dz);
    if (left <= len || i === points.length - 1) {
      const t = len > 0 ? Math.min(1, left / len) : 0;
      return {
        p: [(a[0] ?? 0) + dx * t, (a[1] ?? 0) + dy * t, (a[2] ?? 0) + dz * t],
        yaw: Math.atan2(-dx, -dz),
        end: left >= len && i === points.length - 1,
      };
    }
    left -= len;
  }
  const only = points[0] ?? [0, 0, 0];
  return { p: [only[0] ?? 0, only[1] ?? 0, only[2] ?? 0], yaw: 0, end: true };
}

/** Planar length of a polyline. @param {readonly (readonly number[])[]} points */
export function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = /** @type {readonly number[]} */ (points[i - 1]);
    const b = /** @type {readonly number[]} */ (points[i]);
    total += Math.hypot((b[0] ?? 0) - (a[0] ?? 0), (b[2] ?? 0) - (a[2] ?? 0));
  }
  return total;
}
