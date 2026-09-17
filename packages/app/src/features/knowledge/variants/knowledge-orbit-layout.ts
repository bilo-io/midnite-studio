import type { KnowledgeGraphNode, KnowledgeLayoutPosition } from '@midnite/studio-shared';

/**
 * Orbit's own layout (Phase 89 Theme D) — concentric rings by community,
 * computed CLIENT-SIDE from the payload the worker already sent, not a
 * worker layout of its own (that's Theme E's job, a different axis: a
 * layout id on the IPC payload). Pure and deterministic — same payload,
 * same rings, same angles, every time — so it is vitest-covered without
 * touching sigma or graphology. `use-sigma-graph.tsx`'s
 * `SigmaKnowledgeRenderer.setLook` is the only consumer: it tweens every
 * node from its Atlas coordinate to the position this returns.
 */

const MIN_RADIUS = 140;
const MIN_RING_SPACING = 90;

export type OrbitPosition = { x: number; y: number };

type CentroidAndRadius = { cx: number; cy: number; radius: number };

/**
 * The Atlas layout's own centre and extent, so Orbit's rings sit where the
 * graph already sits on screen (not the world origin, which is only ever
 * right by coincidence — see `use-sigma-graph.tsx`'s own note on
 * `focusNode`'s camera-space caveat) and scale to a size comparable to the
 * ForceAtlas2 output instead of a fixed absolute radius that is tiny on a
 * small repo and cramped on a large one.
 */
function atlasCentroidAndRadius(
  nodes: readonly Pick<KnowledgeGraphNode, 'id'>[],
  positions: Readonly<Record<string, KnowledgeLayoutPosition>>,
): CentroidAndRadius {
  if (nodes.length === 0) return { cx: 0, cy: 0, radius: MIN_RADIUS };
  let sx = 0;
  let sy = 0;
  for (const node of nodes) {
    const pos = positions[node.id] ?? { x: 0, y: 0 };
    sx += pos.x;
    sy += pos.y;
  }
  const cx = sx / nodes.length;
  const cy = sy / nodes.length;
  let maxDist = 0;
  for (const node of nodes) {
    const pos = positions[node.id] ?? { x: 0, y: 0 };
    maxDist = Math.max(maxDist, Math.hypot(pos.x - cx, pos.y - cy));
  }
  return { cx, cy, radius: Math.max(MIN_RADIUS, maxDist) };
}

/**
 * One ring per community, ordered by community name for a stable, repeatable
 * layout across renders; each ring's members spaced evenly by angle, also
 * ordered by node id for the same reason. Ring radius grows from the centre
 * so the smallest communities aren't crowded against the biggest — this is
 * "concentric rings BY community" (one ring stands for one community), not a
 * shared set of rings communities are distributed across.
 */
export function computeOrbitPositions(
  nodes: readonly Pick<KnowledgeGraphNode, 'id' | 'communityName'>[],
  positions: Readonly<Record<string, KnowledgeLayoutPosition>>,
): Map<string, OrbitPosition> {
  const byCommunity = new Map<string, string[]>();
  for (const node of nodes) {
    const list = byCommunity.get(node.communityName);
    if (list) list.push(node.id);
    else byCommunity.set(node.communityName, [node.id]);
  }
  const communityNames = [...byCommunity.keys()].sort();
  const { cx, cy, radius: maxRadius } = atlasCentroidAndRadius(nodes, positions);
  const ringStep =
    communityNames.length > 0 ? Math.max(MIN_RING_SPACING, maxRadius / communityNames.length) : MIN_RING_SPACING;

  const out = new Map<string, OrbitPosition>();
  communityNames.forEach((name, ringIndex) => {
    const memberIds = [...(byCommunity.get(name) ?? [])].sort();
    const radius = MIN_RADIUS + ringIndex * ringStep;
    const count = memberIds.length;
    memberIds.forEach((id, memberIndex) => {
      const angle = (memberIndex / Math.max(count, 1)) * Math.PI * 2;
      out.set(id, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
    });
  });
  return out;
}
