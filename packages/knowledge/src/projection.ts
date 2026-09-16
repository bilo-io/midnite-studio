import type { LeanGraph, LeanLink, LeanNode, NodeDetail, RawGraph } from './types';

/**
 * The lean projection — what the picture actually reads, per the phase doc's
 * own field table. Dropped: `_origin`, `context`, `_callable_class`,
 * `norm_label`, `_callable`, the ordinal `confidence` string (`'EXTRACTED'` /
 * `'INFERRED'`), and the long `source_location` strings (kept out-of-band in
 * the detail index instead, see {@link buildDetailIndex}).
 *
 * `confidence_score` (the numeric 0-1 one) DOES survive, as `confidence` —
 * Theme A's own checklist dropped it and flagged the drop as provisional
 * ("Theme E will want confidence back for its edge filter, left as a small
 * addition for it"); this is that addition, landing with Theme E's edge
 * filter that actually reads it. Bumps {@link PROJECTION_FORMAT_VERSION}
 * (`cache.ts`) since it widens the cached/wire shape.
 */
export function projectGraph(graph: RawGraph): LeanGraph {
  const nodes: LeanNode[] = graph.nodes.map((node) => ({
    id: node.id,
    label: node.label,
    community: node.community,
    community_name: node.community_name,
    file_type: node.file_type,
  }));

  const links: LeanLink[] = graph.links.map((link) => ({
    source: link.source,
    target: link.target,
    relation: link.relation,
    // Missing means "graphify didn't score this edge" — default to a
    // full-strength edge rather than dropping it or treating it as zero.
    weight: link.weight ?? 1,
    // Same default reasoning as `weight`: a missing numeric score is "not
    // scored", not "scored zero".
    confidence:
      typeof link['confidence_score'] === 'number' ? (link['confidence_score'] as number) : 1,
  }));

  return { nodes, links, builtAtCommit: graph.built_at_commit };
}

/**
 * Per-node detail, keyed by id, kept OUT of the lean projection so a click can
 * fetch one node's `source_file`/`source_location` without the projection
 * having carried it for all 14,881 (phase doc, Theme A).
 *
 * Built from the raw graph rather than persisted: the cache (Theme A's other
 * artifact) stores lean node/link data plus layout positions, and this index
 * is cheap enough to rebuild from a freshly-read `graph.json` on every open —
 * see `readGraph`'s own cost versus a multi-second layout, which is the part
 * actually worth caching.
 */
export function buildDetailIndex(graph: RawGraph): Map<string, NodeDetail> {
  const index = new Map<string, NodeDetail>();
  for (const node of graph.nodes) {
    if (node.source_file && node.source_location) {
      index.set(node.id, {
        sourceFile: node.source_file,
        sourceLocation: node.source_location,
      });
    }
  }
  return index;
}

/** Byte length of a UTF-8 JSON encoding — for recording the before/after projection size. */
export function jsonByteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}
