import type { LeanGraph, LeanLink, LeanNode, NodeDetail, RawGraph } from './types';

/**
 * The lean projection — what the picture actually reads, per the phase doc's
 * own field table. Dropped: `_origin`, `context`, `confidence_score`,
 * `_callable_class`, `norm_label`, `_callable`, and the long `source_location`
 * strings (kept out-of-band in the detail index instead, see
 * {@link buildDetailIndex}). `confidence` (the link's ordinal string) is
 * dropped too — Theme A's own checklist names exactly `source`/`target`/
 * `relation`/`weight` as the link fields that survive; a `relation`+`weight`
 * combined edge filter is what Theme E ships this phase, and a filter that
 * also wants `confidence` is a small, additive extension of this projection
 * for whoever builds it, not a reason to widen it speculatively now.
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
