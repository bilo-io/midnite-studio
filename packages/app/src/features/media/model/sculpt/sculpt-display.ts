import { BufferAttribute, BufferGeometry, DynamicDrawUsage } from 'three';

import type { SculptDelta, SculptLoaded } from './sculpt-protocol';

/**
 * The display side of a sculpt mesh (Phase 104 Theme A): a three `BufferGeometry` built once from the
 * worker's `loaded` reply, then patched in place per stroke. A delta touches a contiguous vertex range,
 * so only that range is copied into the attribute arrays and marked with `addUpdateRange` — the GPU
 * re-uploads those bytes, never the whole million-vertex buffer.
 */
export function createSculptGeometry(mesh: Pick<SculptLoaded, 'positions' | 'normals' | 'indices'>): BufferGeometry {
  const geometry = new BufferGeometry();
  const position = new BufferAttribute(mesh.positions, 3);
  const normal = new BufferAttribute(mesh.normals, 3);
  // Rewritten by every stroke: tell the driver up front.
  position.setUsage(DynamicDrawUsage);
  normal.setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setAttribute('normal', normal);
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Copies a delta into the geometry and schedules an upload of exactly that range. Ranges accumulate until
 * the next render uploads them (three's renderer clears them after the upload), so several deltas
 * between two frames are all kept. The bounding sphere is not touched per dab (it is O(n));
 * call `geometry.computeBoundingSphere()` once a stroke ends.
 */
export function applySculptDelta(geometry: BufferGeometry, delta: SculptDelta): void {
  const start = delta.start * 3;
  const count = (delta.end - delta.start) * 3;
  for (const [name, data] of [
    ['position', delta.positions],
    ['normal', delta.normals],
  ] as const) {
    const attribute = geometry.getAttribute(name) as BufferAttribute;
    (attribute.array as Float32Array).set(data, start);
    attribute.addUpdateRange(start, count);
    attribute.needsUpdate = true;
  }
}
