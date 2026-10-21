// @ts-check
/**
 * Midnite game kit — road geometry from the terrain pack's road graph
 * (engine-free).
 *
 * `roads.json` gives each edge a centreline of `[x, y, z]` points and a width.
 * `roadRibbon` turns one into a triangle strip lying on that centreline,
 * lifted a few centimetres so it never z-fights the ground under it.
 */

/**
 * @param {readonly (readonly number[])[]} points centreline `[x, y, z]`, at least two
 * @param {number} width metres
 * @param {number} [lift] metres above the centreline
 * @returns {{ positions: Float32Array, indices: Uint32Array }}
 */
export function roadRibbon(points, width, lift = 0.05) {
  const n = points.length;
  const positions = new Float32Array(n * 2 * 3);
  if (n < 2) return { positions: new Float32Array(0), indices: new Uint32Array(0) };
  const half = width / 2;
  for (let k = 0; k < n; k += 1) {
    const prev = points[Math.max(0, k - 1)] ?? [];
    const next = points[Math.min(n - 1, k + 1)] ?? [];
    const tx = (next[0] ?? 0) - (prev[0] ?? 0);
    const tz = (next[2] ?? 0) - (prev[2] ?? 0);
    const len = Math.hypot(tx, tz) || 1;
    // Left of travel on the ground plane.
    const nx = -tz / len;
    const nz = tx / len;
    const [x = 0, y = 0, z = 0] = points[k] ?? [];
    positions.set([x + nx * half, y + lift, z + nz * half, x - nx * half, y + lift, z - nz * half], k * 6);
  }
  const indices = new Uint32Array((n - 1) * 6);
  for (let k = 0; k < n - 1; k += 1) {
    const a = k * 2;
    // Wound so the top face points up (+y).
    indices.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], k * 6);
  }
  return { positions, indices };
}

/**
 * Adjacency for game code (pathing cars along roads, spawning at junctions):
 * node id → the edges that touch it.
 * @param {{ nodes: { id: number }[], edges: { id: number, a: number, b: number }[] }} graph
 * @returns {Map<number, number[]>}
 */
export function roadAdjacency(graph) {
  /** @type {Map<number, number[]>} */
  const out = new Map(graph.nodes.map((node) => [node.id, []]));
  for (const edge of graph.edges) {
    out.get(edge.a)?.push(edge.id);
    if (edge.b !== edge.a) out.get(edge.b)?.push(edge.id);
  }
  return out;
}
