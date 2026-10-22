import { rotate3D, project3D, type ProjectedPoint, type Vec3 } from '../audio/epic-audio-player';
import {
  communityCentroids,
  communityNameFromNodeId,
  communityNodeId,
  aggregateCommunityEdges,
  isAggregatedEdgeVisible,
  nodesByCommunity,
  sizeForMemberCount,
} from './knowledge-community-collapse';
import { computeDegrees } from './knowledge-degree';
import { selectCoreNodeIds } from './knowledge-detail';
import { isCommunityVisible, isLinkVisible, searchMatches } from './knowledge-filters';
import { computeHighlightSets } from './knowledge-highlight';
import type { KnowledgeGraphPayload } from '@midnite/studio-shared';

/**
 * Pure 3D projection, colour palette, and style maths for the 3D knowledge-graph
 * presentation variants (`telemetry-3d`, `synapse-3d`, and 3D preview thumbnails
 * across all 6 presentation styles).
 *
 * Kept pure and DOM-free so unit tests can assert 3D depth separation, rotation,
 * perspective projection, cluster telemetry readouts, and curved synapse control
 * points under bare vitest.
 */

export type KnowledgeStyleId =
  | 'atlas'
  | 'constellation'
  | 'orbit'
  | 'clusters'
  | 'telemetry-3d'
  | 'synapse-3d';

export type KnowledgeStyleMeta = {
  id: KnowledgeStyleId;
  label: string;
  blurb: string;
  badge3D?: boolean;
};

export const KNOWLEDGE_STYLE_META: Record<KnowledgeStyleId, KnowledgeStyleMeta> = {
  atlas: {
    id: 'atlas',
    label: 'Atlas',
    blurb: 'Force-directed 3D cluster topography with community hues, degree-scaled hubs, and crisp inter-cluster links.',
    badge3D: true,
  },
  constellation: {
    id: 'constellation',
    label: 'Constellation',
    blurb: 'Deep-space starfield with curved orbital arcs, high-degree stellar bloom, and subtle ambient filaments.',
    badge3D: true,
  },
  orbit: {
    id: 'orbit',
    label: 'Orbit',
    blurb: 'Concentric 3D orbital rings grouped by community with radial cross-cluster bridges.',
    badge3D: true,
  },
  clusters: {
    id: 'clusters',
    label: 'Clusters',
    blurb: 'Community-first 3D bubble envelopes with aggregated inter-cluster conduits that expand on double-click.',
    badge3D: true,
  },
  'telemetry-3d': {
    id: 'telemetry-3d',
    label: 'Telemetry HUD',
    blurb: '3D tactical telemetry grid with high-contrast cluster palettes, callout vectors (K-5.3, N-4.9), and numeric node readouts.',
    badge3D: true,
  },
  'synapse-3d': {
    id: 'synapse-3d',
    label: 'Synapse Flow',
    blurb: '3D neural-synaptic web with glowing cyan and magenta hubs, sweeping bezier arcs, and floating edge confidence weights.',
    badge3D: true,
  },
};

export const KNOWLEDGE_STYLE_IDS: readonly KnowledgeStyleId[] = [
  'atlas',
  'constellation',
  'orbit',
  'clusters',
  'telemetry-3d',
  'synapse-3d',
];

/**
 * High-contrast neon cluster palettes for the Telemetry HUD style (reference image 1:
 * golden-yellow cluster, crimson-orange cluster, cyan-emerald cluster, electric-violet cluster).
 */
export const TELEMETRY_CLUSTER_PALETTE = [
  { fill: '#facc15', glow: 'rgba(250, 204, 21, 0.55)', edge: 'rgba(250, 204, 21, 0.42)', code: 'N' },
  { fill: '#00f5d4', glow: 'rgba(0, 245, 212, 0.55)', edge: 'rgba(0, 245, 212, 0.42)', code: 'K' },
  { fill: '#ff3b30', glow: 'rgba(255, 59, 48, 0.55)', edge: 'rgba(255, 59, 48, 0.42)', code: 'R' },
  { fill: '#a855f7', glow: 'rgba(168, 85, 247, 0.55)', edge: 'rgba(168, 85, 247, 0.42)', code: 'L' },
  { fill: '#38bdf8', glow: 'rgba(56, 189, 248, 0.55)', edge: 'rgba(56, 189, 248, 0.42)', code: 'H' },
  { fill: '#fb923c', glow: 'rgba(251, 146, 60, 0.55)', edge: 'rgba(251, 146, 60, 0.42)', code: 'S' },
] as const;

/**
 * Bioluminescent cyan / violet / magenta palette for the Synapse Flow style (reference image 2:
 * glowing cyan and magenta spheres with violet/cyan curved filaments and floating 8-decimal weights).
 */
export const SYNAPSE_CLUSTER_PALETTE = [
  { fill: '#00f2fe', glow: 'rgba(0, 242, 254, 0.72)', edge: 'rgba(0, 242, 254, 0.36)', text: '#5eead4' },
  { fill: '#d946ef', glow: 'rgba(217, 70, 239, 0.78)', edge: 'rgba(217, 70, 239, 0.52)', text: '#f0abfc' },
  { fill: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.74)', edge: 'rgba(139, 92, 246, 0.44)', text: '#c4b5fd' },
  { fill: '#22d3ee', glow: 'rgba(34, 211, 238, 0.72)', edge: 'rgba(34, 211, 238, 0.38)', text: '#67e8f9' },
] as const;

/**
 * Deterministic hash in `[0, 1)` from a string id — used to assign stable Z-depth
 * offsets and deterministic telemetry/synapse metrics.
 */
export function hashUnit(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100_000) / 100_000;
}

export type Node3D = {
  id: string;
  label: string;
  community: number;
  communityName: string;
  fileType: string;
  degree: number;
  kind: 'node' | 'community';
  memberCount: number;
  /** Normalized 3D world coordinates in roughly `[-180, 180]`. */
  pos: Vec3;
  /** Base radius in pixels before perspective scaling. */
  radius: number;
  /** Telemetry numeric readout (e.g. `77.247`). */
  telemetryMetric: string;
};

export type Edge3D = {
  id: string;
  sourceId: string;
  targetId: string;
  relation: string;
  weight: number;
  confidence: number;
  sourceCommunity: number;
  targetCommunity: number;
  /** Formatted 7-decimal synapse score (e.g. `0.9830614` or `1.0`). */
  synapseScore: string;
  /** Curve normal offset in 3D space for Synapse / Constellation styles. */
  curveArch: number;
};

export type ClusterCallout3D = {
  community: number;
  communityName: string;
  codeLabel: string;
  pos: Vec3;
  memberCount: number;
};

export type Scene3D = {
  nodes: Node3D[];
  nodeById: Map<string, Node3D>;
  edges: Edge3D[];
  clusters: ClusterCallout3D[];
};

/**
 * Formats an edge's confidence and weight into the 7–8 decimal floating readout
 * seen in the Synapse Flow reference (`0.98300614`, `0.9402857`, `1.0`).
 */
export function formatSynapseScore(confidence: number, weight: number, edgeId: string): string {
  if (confidence >= 0.999 && weight >= 1.5 && hashUnit(edgeId) > 0.72) {
    return '1.0';
  }
  const base = Math.max(0.75, Math.min(0.9994, confidence * 0.92 + Math.min(1, weight) * 0.07));
  const micro = (hashUnit(`${edgeId}:syn`) - 0.5) * 0.045;
  const val = Math.max(0.7100123, Math.min(0.9992489, base + micro));
  return val.toFixed(7);
}

/**
 * Formats a node's degree + hash into a Telemetry HUD numeric readout (`77.247`, `29.625`, `15.683`).
 */
export function formatTelemetryNodeMetric(degree: number, nodeId: string): string {
  const whole = Math.min(99, Math.max(11, Math.round(12 + degree * 6.5 + hashUnit(nodeId) * 58)));
  const frac = Math.floor(100 + hashUnit(`${nodeId}:f`) * 899);
  return `${whole}.${frac}`;
}

/**
 * Builds a normalized 3D scene from a `KnowledgeGraphPayload`, respecting `maxNodes`
 * and `collapsedCommunities`. Each community receives its own Z-plane elevation
 * wave + spherical cluster depth so rotating the camera reveals true 3D parallax
 * between the interconnected clusters.
 */
export function buildScene3D(
  payload: KnowledgeGraphPayload,
  options: {
    maxNodes?: number;
    collapsedCommunities?: ReadonlySet<string>;
    orbitLayout?: boolean;
  } = {},
): Scene3D {
  const maxNodes = options.maxNodes ?? Infinity;
  const collapsed = options.collapsedCommunities ?? new Set<string>();
  const degrees = computeDegrees(payload.links);
  const coreIds = selectCoreNodeIds(payload.nodes, degrees, maxNodes);

  // Compute 2D bounds to normalize into [-165, 165]
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of payload.nodes) {
    if (coreIds && !coreIds.has(node.id)) continue;
    const p = payload.positions[node.id] ?? { x: 0, y: 0 };
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) {
    minX = -1;
    maxX = 1;
    minY = -1;
    maxY = 1;
  }
  const spanX = Math.max(1e-5, maxX - minX);
  const spanY = Math.max(1e-5, maxY - minY);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const normX = (x: number) => ((x - midX) / spanX) * 310;
  const normY = (y: number) => ((y - midY) / spanY) * 230;

  const grouped = nodesByCommunity(payload.nodes);
  const centroids = communityCentroids(payload.nodes, payload.positions);
  const distinctComms = [...grouped.keys()];

  const nodes: Node3D[] = [];
  const nodeById = new Map<string, Node3D>();
  const communityIndexByName = new Map<string, number>();
  distinctComms.forEach((name, idx) => communityIndexByName.set(name, idx));

  // Add collapsed community meta-nodes first
  for (const commName of collapsed) {
    const members = grouped.get(commName);
    if (!members || members.length === 0) continue;
    const c = centroids.get(commName) ?? { x: midX, y: midY };
    const commIdx = communityIndexByName.get(commName) ?? 0;
    const zCluster = Math.sin(commIdx * 1.7 + 0.4) * 85;
    const id = communityNodeId(commName);
    const deg = members.reduce((sum, m) => sum + (degrees.get(m.id) ?? 0), 0);
    const node3d: Node3D = {
      id,
      label: `${commName} (${members.length})`,
      community: members[0]?.community ?? commIdx,
      communityName: commName,
      fileType: 'community',
      degree: deg,
      kind: 'community',
      memberCount: members.length,
      pos: [normX(c.x), normY(c.y), zCluster],
      radius: Math.min(18, Math.max(8, sizeForMemberCount(members.length) * 0.85)),
      telemetryMetric: formatTelemetryNodeMetric(deg, id),
    };
    nodes.push(node3d);
    nodeById.set(id, node3d);
  }

  // Add individual nodes for uncollapsed communities
  for (const node of payload.nodes) {
    if (coreIds && !coreIds.has(node.id)) continue;
    if (collapsed.has(node.communityName)) continue;
    const rawPos = payload.positions[node.id] ?? { x: 0, y: 0 };
    const commIdx = communityIndexByName.get(node.communityName) ?? node.community;
    const u = hashUnit(node.id);
    const v = hashUnit(`${node.id}:z`);
    const deg = degrees.get(node.id) ?? 1;

    let pos: Vec3;
    if (options.orbitLayout) {
      const ringRadius = 48 + (commIdx % 5) * 34;
      const angle = u * Math.PI * 2 + commIdx * 0.8;
      const zOrb = Math.cos(angle * 2 + commIdx) * 55 + (v - 0.5) * 35;
      pos = [Math.cos(angle) * ringRadius * 1.25, Math.sin(angle) * ringRadius * 0.95, zOrb];
    } else {
      const zCluster = Math.sin(commIdx * 1.85 + 0.5) * 78;
      const zLocal = (v - 0.5) * 72 + Math.min(28, deg * 2.2) * (u > 0.5 ? 1 : -1);
      pos = [normX(rawPos.x), normY(rawPos.y), zCluster + zLocal];
    }

    const radius = Math.min(13.5, Math.max(3.2, 3.2 + Math.log2(1 + deg) * 2.15));
    const node3d: Node3D = {
      id: node.id,
      label: node.label,
      community: node.community,
      communityName: node.communityName,
      fileType: node.fileType,
      degree: deg,
      kind: 'node',
      memberCount: 1,
      pos,
      radius,
      telemetryMetric: formatTelemetryNodeMetric(deg, node.id),
    };
    nodes.push(node3d);
    nodeById.set(node.id, node3d);
  }

  // Build edges
  const edges: Edge3D[] = [];
  const communityByRawNode = new Map<string, string>();
  for (const n of payload.nodes) communityByRawNode.set(n.id, n.communityName);

  for (let i = 0; i < payload.links.length; i += 1) {
    const link = payload.links[i]!;
    const sComm = communityByRawNode.get(link.source);
    const tComm = communityByRawNode.get(link.target);
    if ((sComm && collapsed.has(sComm)) || (tComm && collapsed.has(tComm))) continue;
    const sNode = nodeById.get(link.source);
    const tNode = nodeById.get(link.target);
    if (!sNode || !tNode) continue;
    const id = `e:${i}:${link.source}->${link.target}`;
    const archSign = hashUnit(id) >= 0.5 ? 1 : -1;
    edges.push({
      id,
      sourceId: sNode.id,
      targetId: tNode.id,
      relation: link.relation,
      weight: link.weight,
      confidence: link.confidence,
      sourceCommunity: sNode.community,
      targetCommunity: tNode.community,
      synapseScore: formatSynapseScore(link.confidence, link.weight, id),
      curveArch: archSign * (0.16 + hashUnit(`${id}:arch`) * 0.22),
    });
  }

  if (collapsed.size > 0) {
    const agg = aggregateCommunityEdges(payload.links, communityByRawNode, collapsed);
    for (let i = 0; i < agg.length; i += 1) {
      const a = agg[i]!;
      const sNode = nodeById.get(a.source);
      const tNode = nodeById.get(a.target);
      if (!sNode || !tNode) continue;
      const id = `agg:${i}:${a.source}->${a.target}`;
      edges.push({
        id,
        sourceId: sNode.id,
        targetId: tNode.id,
        relation: a.relations[0] ?? 'related',
        weight: a.weight,
        confidence: a.confidence,
        sourceCommunity: sNode.community,
        targetCommunity: tNode.community,
        synapseScore: formatSynapseScore(a.confidence, a.weight, id),
        curveArch: 0.2,
      });
    }
  }

  // Build cluster telemetry callouts for the top communities
  const clusters: ClusterCallout3D[] = [];
  for (let i = 0; i < distinctComms.length && clusters.length < 6; i += 1) {
    const commName = distinctComms[i]!;
    const members = grouped.get(commName) ?? [];
    const mountedMembers = members.filter((m) => nodeById.has(m.id));
    if (mountedMembers.length === 0) continue;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (const m of mountedMembers) {
      const mn = nodeById.get(m.id)!;
      sx += mn.pos[0];
      sy += mn.pos[1];
      sz += mn.pos[2];
    }
    const count = mountedMembers.length;
    const paletteEntry = TELEMETRY_CLUSTER_PALETTE[i % TELEMETRY_CLUSTER_PALETTE.length]!;
    const metricVal = (2.1 + ((i * 1.7 + count * 0.35) % 6.8)).toFixed(1);
    clusters.push({
      community: members[0]?.community ?? i,
      communityName: commName,
      codeLabel: `${paletteEntry.code} - ${metricVal}`,
      pos: [sx / count, sy / count - 26, sz / count],
      memberCount: members.length,
    });
  }

  return { nodes, nodeById, edges, clusters };
}

/**
 * Projects a `Vec3` with camera rotation `(rx, ry, rz)` and zoom onto a 2D canvas.
 */
export function projectScenePoint(
  pos: Vec3,
  rx: number,
  ry: number,
  rz: number,
  centerX: number,
  centerY: number,
  zoom: number = 1,
): ProjectedPoint {
  const rotated = rotate3D(pos, rx, ry, rz);
  const camDist = Math.max(160, 440 / Math.max(0.25, zoom));
  return project3D(rotated, centerX, centerY, 420, camDist);
}

/**
 * Computes a quadratic bezier control point `(cx, cy)` and midpoint `(mx, my)`
 * between two projected endpoints `(x1, y1)` and `(x2, y2)`.
 */
export function computeCurvedEdge2D(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  arch: number,
): { cx: number; cy: number; mx: number; my: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const cx = (x1 + x2) * 0.5 - dy * arch;
  const cy = (y1 + y2) * 0.5 + dx * arch;
  // Point on quadratic bezier at t = 0.5
  const mx = 0.25 * x1 + 0.5 * cx + 0.25 * x2;
  const my = 0.25 * y1 + 0.5 * cy + 0.25 * y2;
  return { cx, cy, mx, my };
}

/**
 * Synthetic 3-cluster interconnected graph used by every presentation style
 * thumbnail in Settings (and testable deterministically).
 *
 * Three distinct clusters of nodes (Cluster 0: yellow/cyan core, Cluster 1:
 * cyan/emerald upper-right wing, Cluster 2: crimson/magenta lower-right bridge),
 * richly interconnected both within each cluster and across clusters.
 */
export function buildThreeClusterPreviewPayload(): KnowledgeGraphPayload {
  const nodes: KnowledgeGraphPayload['nodes'] = [
    // Cluster 0 (Left / Gold-Cyan core — 7 nodes)
    { id: 'c0-hub', label: 'Core Engine', community: 0, communityName: 'core', fileType: 'document' },
    { id: 'c0-a', label: 'Vector Index', community: 0, communityName: 'core', fileType: 'chunk' },
    { id: 'c0-b', label: 'Query Planner', community: 0, communityName: 'core', fileType: 'concept' },
    { id: 'c0-c', label: 'AST Parser', community: 0, communityName: 'core', fileType: 'chunk' },
    { id: 'c0-d', label: 'Graph Store', community: 0, communityName: 'core', fileType: 'concept' },
    { id: 'c0-e', label: 'Cache Layer', community: 0, communityName: 'core', fileType: 'chunk' },
    { id: 'c0-f', label: 'Ingest Pipe', community: 0, communityName: 'core', fileType: 'concept' },

    // Cluster 1 (Top-Right / Emerald-Cyan wing — 7 nodes)
    { id: 'c1-hub', label: 'Knowledge RAG', community: 1, communityName: 'inference', fileType: 'document' },
    { id: 'c1-a', label: 'Entity Linker', community: 1, communityName: 'inference', fileType: 'concept' },
    { id: 'c1-b', label: 'Chunk Embed', community: 1, communityName: 'inference', fileType: 'chunk' },
    { id: 'c1-c', label: 'Context Hop', community: 1, communityName: 'inference', fileType: 'concept' },
    { id: 'c1-d', label: 'Relation Edge', community: 1, communityName: 'inference', fileType: 'concept' },
    { id: 'c1-e', label: 'Prompt Synth', community: 1, communityName: 'inference', fileType: 'chunk' },
    { id: 'c1-f', label: 'Confidence', community: 1, communityName: 'inference', fileType: 'tag' },

    // Cluster 2 (Bottom-Right / Crimson-Magenta mesh — 7 nodes)
    { id: 'c2-hub', label: 'Agent Memory', community: 2, communityName: 'memory', fileType: 'document' },
    { id: 'c2-a', label: 'Episodic Log', community: 2, communityName: 'memory', fileType: 'chunk' },
    { id: 'c2-b', label: 'Recall Graph', community: 2, communityName: 'memory', fileType: 'concept' },
    { id: 'c2-c', label: 'Semantic Tag', community: 2, communityName: 'memory', fileType: 'tag' },
    { id: 'c2-d', label: 'Session Trace', community: 2, communityName: 'memory', fileType: 'chunk' },
    { id: 'c2-e', label: 'Policy Gate', community: 2, communityName: 'memory', fileType: 'concept' },
    { id: 'c2-f', label: 'Vault Bridge', community: 2, communityName: 'memory', fileType: 'concept' },
  ];

  const positions: KnowledgeGraphPayload['positions'] = {
    'c0-hub': { x: -115, y: -8 },
    'c0-a': { x: -148, y: -52 },
    'c0-b': { x: -82, y: -62 },
    'c0-c': { x: -162, y: 12 },
    'c0-d': { x: -76, y: 24 },
    'c0-e': { x: -130, y: 66 },
    'c0-f': { x: -188, y: -22 },

    'c1-hub': { x: 88, y: -68 },
    'c1-a': { x: 42, y: -102 },
    'c1-b': { x: 132, y: -96 },
    'c1-c': { x: 54, y: -38 },
    'c1-d': { x: 118, y: -32 },
    'c1-e': { x: 162, y: -58 },
    'c1-f': { x: 14, y: -64 },

    'c2-hub': { x: 56, y: 64 },
    'c2-a': { x: 8, y: 88 },
    'c2-b': { x: 104, y: 82 },
    'c2-c': { x: 88, y: 24 },
    'c2-d': { x: 24, y: 42 },
    'c2-e': { x: 142, y: 52 },
    'c2-f': { x: -34, y: 68 },
  };

  const rawLinks: Array<[string, string, string, number, number]> = [
    // Cluster 0 intra-cluster mesh
    ['c0-hub', 'c0-a', 'part_of', 1.4, 0.98],
    ['c0-hub', 'c0-b', 'mentions', 1.3, 0.95],
    ['c0-hub', 'c0-c', 'part_of', 1.2, 0.94],
    ['c0-hub', 'c0-d', 'relates_to', 1.5, 0.99],
    ['c0-hub', 'c0-e', 'part_of', 1.1, 0.92],
    ['c0-a', 'c0-b', 'relates_to', 1.0, 0.91],
    ['c0-a', 'c0-f', 'mentions', 0.9, 0.89],
    ['c0-c', 'c0-e', 'relates_to', 1.0, 0.90],
    ['c0-b', 'c0-d', 'relates_to', 1.2, 0.96],
    ['c0-d', 'c0-e', 'mentions', 1.0, 0.93],

    // Cluster 1 intra-cluster mesh
    ['c1-hub', 'c1-a', 'mentions', 1.4, 0.97],
    ['c1-hub', 'c1-b', 'part_of', 1.3, 0.96],
    ['c1-hub', 'c1-c', 'relates_to', 1.5, 0.99],
    ['c1-hub', 'c1-d', 'relates_to', 1.2, 0.95],
    ['c1-hub', 'c1-e', 'part_of', 1.1, 0.93],
    ['c1-a', 'c1-b', 'relates_to', 1.0, 0.91],
    ['c1-a', 'c1-f', 'tagged', 1.0, 0.94],
    ['c1-c', 'c1-d', 'relates_to', 1.2, 0.96],
    ['c1-b', 'c1-e', 'mentions', 1.0, 0.90],
    ['c1-d', 'c1-e', 'relates_to', 1.1, 0.92],

    // Cluster 2 intra-cluster mesh
    ['c2-hub', 'c2-a', 'part_of', 1.4, 0.98],
    ['c2-hub', 'c2-b', 'relates_to', 1.5, 0.99],
    ['c2-hub', 'c2-c', 'tagged', 1.2, 0.94],
    ['c2-hub', 'c2-d', 'part_of', 1.3, 0.96],
    ['c2-hub', 'c2-e', 'mentions', 1.1, 0.91],
    ['c2-a', 'c2-d', 'relates_to', 1.0, 0.92],
    ['c2-a', 'c2-f', 'relates_to', 1.1, 0.90],
    ['c2-b', 'c2-c', 'mentions', 1.2, 0.95],
    ['c2-b', 'c2-e', 'relates_to', 1.0, 0.93],
    ['c2-c', 'c2-d', 'tagged', 1.0, 0.89],

    // Inter-cluster bridges (Cluster 0 <-> Cluster 1)
    ['c0-hub', 'c1-hub', 'references', 1.8, 1.0],
    ['c0-b', 'c1-f', 'relates_to', 1.3, 0.96],
    ['c0-b', 'c1-c', 'mentions', 1.2, 0.94],
    ['c0-d', 'c1-c', 'relates_to', 1.1, 0.92],

    // Inter-cluster bridges (Cluster 0 <-> Cluster 2)
    ['c0-hub', 'c2-hub', 'references', 1.7, 0.99],
    ['c0-d', 'c2-d', 'relates_to', 1.4, 0.97],
    ['c0-e', 'c2-f', 'relates_to', 1.3, 0.95],
    ['c0-d', 'c2-a', 'mentions', 1.1, 0.91],

    // Inter-cluster bridges (Cluster 1 <-> Cluster 2)
    ['c1-hub', 'c2-hub', 'references', 1.8, 1.0],
    ['c1-c', 'c2-c', 'relates_to', 1.4, 0.97],
    ['c1-d', 'c2-c', 'mentions', 1.3, 0.95],
    ['c1-d', 'c2-e', 'relates_to', 1.2, 0.93],
    ['c1-c', 'c2-d', 'relates_to', 1.1, 0.91],
  ];

  const links: KnowledgeGraphPayload['links'] = rawLinks.map(
    ([source, target, relation, weight, confidence]) => ({
      source,
      target,
      relation,
      weight,
      confidence,
    }),
  );

  return {
    nodes,
    links,
    positions,
    builtAtCommit: 'preview-3-clusters',
    cached: true,
    commitsBehind: 0,
  };
}

export { communityNameFromNodeId, isAggregatedEdgeVisible, isCommunityVisible, isLinkVisible, searchMatches, computeHighlightSets };
