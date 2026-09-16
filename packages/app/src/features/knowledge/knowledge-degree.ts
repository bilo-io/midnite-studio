import type { KnowledgeGraphLink } from '@midnite/studio-shared';

/**
 * Undirected degree per node id — how many links touch it, either as source
 * or target, over ALL links (not just the currently filtered/visible ones,
 * so a node's size does not jump around as the edge filter changes). Feeds
 * both node sizing and the label zoom-LOD's degree threshold (Theme D).
 */
export function computeDegrees(
  links: readonly Pick<KnowledgeGraphLink, 'source' | 'target'>[],
): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const link of links) {
    degrees.set(link.source, (degrees.get(link.source) ?? 0) + 1);
    degrees.set(link.target, (degrees.get(link.target) ?? 0) + 1);
  }
  return degrees;
}

/** Node radius from degree — a gentle sqrt curve so a handful of hub nodes don't dwarf everything else. */
export function sizeForDegree(degree: number, minSize = 2, maxSize = 14): number {
  const size = minSize + Math.sqrt(Math.max(degree, 0));
  return Math.min(maxSize, size);
}
