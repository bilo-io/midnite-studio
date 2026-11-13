import { resolveVariant, VARIANTS, type KnowledgeVariant, type KnowledgeVariantId } from './renderer-contract';

/**
 * The capability gate (Phase 89 Theme J): a variant may declare `maxNodes` / `maxEdges`, and above
 * either the pill is disabled with the reason, instead of letting a renderer that cannot cope open
 * on a 15k-node graph. Pure, so the threshold arithmetic is unit-tested rather than eyeballed.
 *
 * No variant declares a limit yet: the numbers have to come from the bake-off measured on the
 * packaged app, and nothing here guesses them. Declaring one is a one-line registry change.
 */
export type GraphCounts = { nodes: number; edges: number };

export type VariantGate = { allowed: true } | { allowed: false; reason: string };

export function variantGate(variant: Pick<KnowledgeVariant, 'label' | 'maxNodes' | 'maxEdges'>, counts: GraphCounts): VariantGate {
  if (variant.maxNodes !== undefined && counts.nodes > variant.maxNodes) {
    return {
      allowed: false,
      reason: `${variant.label} is limited to ${fmt(variant.maxNodes)} nodes; this graph has ${fmt(counts.nodes)}.`,
    };
  }
  if (variant.maxEdges !== undefined && counts.edges > variant.maxEdges) {
    return {
      allowed: false,
      reason: `${variant.label} is limited to ${fmt(variant.maxEdges)} edges; this graph has ${fmt(counts.edges)}.`,
    };
  }
  return { allowed: true };
}

/**
 * The variant to RENDER for a stored preference. The preference itself is never rewritten: when it
 * is gated for this graph the default renders instead and `gatedReason` says so, and a smaller
 * graph restores the stored one.
 */
export function effectiveVariant(
  storedId: KnowledgeVariantId,
  counts: GraphCounts,
): { id: KnowledgeVariantId; gatedReason: string | null } {
  const stored = resolveVariant(storedId);
  const gate = variantGate(stored, counts);
  if (gate.allowed) return { id: stored.id, gatedReason: null };
  return { id: VARIANTS[0]!.id, gatedReason: gate.reason };
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}
