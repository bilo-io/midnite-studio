import type { ModelSculptPart } from '@midnite/studio-shared';

/** What a flushed sculpt mesh file records on its part (Phase 104 Theme D). */
export type SculptFile = { src: string; hash: string; vertices: number; triangles: number; multiresLevel: number };

/** A sculpt part repointed at a freshly written mesh file (a base-level mesh records no level). */
export function withSculptFile(part: ModelSculptPart, file: SculptFile): ModelSculptPart {
  const { multiresLevel: _old, ...rest } = part;
  return { ...rest, src: file.src, hash: file.hash, vertices: file.vertices, triangles: file.triangles, ...(file.multiresLevel > 0 ? { multiresLevel: file.multiresLevel } : {}) };
}
