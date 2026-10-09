/** Small meshes the Theme F tests share — not exported from the package. */

/** A closed UV sphere: poles plus `rings - 1` latitude rows of `segments` vertices. */
export function uvSphere(radius: number, segments: number, rings: number): { positions: Float32Array; indices: Uint32Array } {
  const pos: number[] = [0, radius, 0];
  for (let r = 1; r < rings; r += 1) {
    const phi = (Math.PI * r) / rings;
    for (let s = 0; s < segments; s += 1) {
      const theta = (2 * Math.PI * s) / segments;
      pos.push(radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
    }
  }
  pos.push(0, -radius, 0);
  const south = pos.length / 3 - 1;
  const row = (r: number, s: number): number => 1 + (r - 1) * segments + (s % segments);
  const idx: number[] = [];
  for (let s = 0; s < segments; s += 1) idx.push(0, row(1, s + 1), row(1, s));
  for (let r = 1; r < rings - 1; r += 1) {
    for (let s = 0; s < segments; s += 1) {
      idx.push(row(r, s), row(r, s + 1), row(r + 1, s));
      idx.push(row(r, s + 1), row(r + 1, s + 1), row(r + 1, s));
    }
  }
  for (let s = 0; s < segments; s += 1) idx.push(south, row(rings - 1, s), row(rings - 1, s + 1));
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}

/** An axis-aligned cube of edge `size` centred on the origin, 8 shared vertices, 12 triangles, outward-facing. */
export function cube(size = 1): { positions: Float32Array; indices: Uint32Array } {
  const h = size / 2;
  const positions = new Float32Array([-h, -h, -h, h, -h, -h, h, h, -h, -h, h, -h, -h, -h, h, h, -h, h, h, h, h, -h, h, h]);
  const indices = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]);
  return { positions, indices };
}

/** A flat `n × n` grid of quads in the XZ plane (open, facing +y). */
export function flatGrid(n: number, size = 1): { positions: Float32Array; indices: Uint32Array } {
  const pos: number[] = [];
  for (let z = 0; z <= n; z += 1) for (let x = 0; x <= n; x += 1) pos.push((x / n - 0.5) * size, 0, (z / n - 0.5) * size);
  const idx: number[] = [];
  const at = (x: number, z: number): number => z * (n + 1) + x;
  for (let z = 0; z < n; z += 1) {
    for (let x = 0; x < n; x += 1) {
      idx.push(at(x, z), at(x, z + 1), at(x + 1, z));
      idx.push(at(x + 1, z), at(x, z + 1), at(x + 1, z + 1));
    }
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}

/** Closed means every edge is used by exactly two triangles. */
export function isClosedManifold(indices: ArrayLike<number>): boolean {
  const counts = new Map<string, number>();
  for (let f = 0; f < indices.length; f += 3) {
    for (let k = 0; k < 3; k += 1) {
      const a = indices[f + k]!;
      const b = indices[f + ((k + 1) % 3)]!;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  for (const c of counts.values()) if (c !== 2) return false;
  return true;
}
