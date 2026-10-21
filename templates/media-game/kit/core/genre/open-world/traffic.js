// @ts-check
/**
 * Midnite game kit — traffic and pedestrians on a road graph (engine-free).
 *
 * An agent lives on one edge at a time: `s` metres from the edge's start in
 * its direction of travel (`dir` 1 = a→b, −1 = b→a). At the end of an edge
 * it turns onto another edge at that node, chosen by the seeded generator, or
 * U-turns at a dead end. Cars keep to the right of the centre line by a
 * quarter of the road's width; pedestrians walk the verges, just outside it.
 */

import { pointAlong, polylineLength } from './route.js';

/**
 * @typedef {import('./route.js').RoadGraph} RoadGraph
 * @typedef {import('./route.js').RoadEdge} RoadEdge
 * @typedef {{ kind: 'car' | 'pedestrian', edge: number, dir: 1 | -1, s: number, speed: number }} TrafficAgent
 * @typedef {{ next(): number }} Rng
 */

export const TRAFFIC_DEFAULTS = {
  car: { speed: [8, 14], perKm: 6 },
  pedestrian: { speed: [1.1, 1.6], perKm: 10 },
};

/**
 * Seed agents along the edges: `density` per kilometre of road, at least
 * none, spread along each edge with a random direction and speed.
 * @param {readonly RoadEdge[]} edges
 * @param {number} density agents per km
 * @param {Rng} rng
 * @param {{ kind?: 'car' | 'pedestrian', speed?: readonly number[] }} [options]
 * @returns {TrafficAgent[]}
 */
export function trafficSpawn(edges, density, rng, options = {}) {
  const kind = options.kind ?? 'car';
  const [lo = 8, hi = 14] = options.speed ?? TRAFFIC_DEFAULTS[kind].speed;
  /** @type {TrafficAgent[]} */
  const out = [];
  for (const edge of edges) {
    const length = polylineLength(edge.points);
    const exact = (length / 1000) * density;
    // Whole agents, plus one more with the fractional remainder as its chance.
    const count = Math.floor(exact) + (rng.next() < exact - Math.floor(exact) ? 1 : 0);
    for (let i = 0; i < count; i += 1) {
      out.push({
        kind,
        edge: edge.id,
        dir: rng.next() < 0.5 ? 1 : -1,
        s: ((i + rng.next()) / count) * length,
        speed: lo + rng.next() * (hi - lo),
      });
    }
  }
  return out;
}

/** The edge's points in travel direction. @param {RoadEdge} edge @param {1 | -1} dir */
const travelPoints = (edge, dir) => (dir === 1 ? edge.points : [...edge.points].reverse());

/**
 * Advance one agent by `dt` seconds, turning at junctions. Mutates and returns it.
 * @param {TrafficAgent} agent
 * @param {RoadGraph} roads
 * @param {number} dt
 * @param {Rng} rng
 * @param {{ edges?: Map<number, RoadEdge>, touching?: Map<number, RoadEdge[]> }} [index] precomputed lookups (`indexRoads`)
 */
export function trafficStep(agent, roads, dt, rng, index = indexRoads(roads)) {
  let edge = index.edges?.get(agent.edge);
  if (!edge) return agent;
  agent.s += agent.speed * dt;
  // Several short edges can pass in one step; bound the hops so a degenerate graph cannot spin.
  for (let hops = 0; hops < 8; hops += 1) {
    const length = polylineLength(edge.points);
    if (agent.s <= length) break;
    agent.s -= length;
    const node = agent.dir === 1 ? edge.b : edge.a;
    const options = (index.touching?.get(node) ?? []).filter((e) => e.id !== edge?.id);
    const next = options.length === 0 ? edge : /** @type {RoadEdge} */ (options[Math.floor(rng.next() * options.length)]);
    agent.edge = next.id;
    agent.dir = next.a === node ? 1 : -1;
    edge = next;
  }
  return agent;
}

/** Lookups `trafficStep` needs, built once per graph. @param {RoadGraph} roads */
export function indexRoads(roads) {
  const edges = new Map(roads.edges.map((e) => [e.id, e]));
  /** @type {Map<number, RoadEdge[]>} */
  const touching = new Map(roads.nodes.map((n) => [n.id, []]));
  for (const e of roads.edges) {
    touching.get(e.a)?.push(e);
    if (e.b !== e.a) touching.get(e.b)?.push(e);
  }
  return { edges, touching };
}

/**
 * Where an agent is in the world: on its lane (cars) or verge (pedestrians),
 * offset to the right of travel.
 * @param {TrafficAgent} agent
 * @param {Map<number, RoadEdge>} edges
 * @returns {{ p: number[], yaw: number }}
 */
export function agentPose(agent, edges) {
  const edge = edges.get(agent.edge);
  if (!edge) return { p: [0, 0, 0], yaw: 0 };
  const { p, yaw } = pointAlong(travelPoints(edge, agent.dir), agent.s);
  const width = edge.widthM ?? 8;
  const offset = agent.kind === 'car' ? width / 4 : width / 2 + 1;
  // Right of a body facing yaw (forward = (−sin, −cos)) is (cos, −sin).
  return { p: [(p[0] ?? 0) + Math.cos(yaw) * offset, p[1] ?? 0, (p[2] ?? 0) - Math.sin(yaw) * offset], yaw };
}
