/**
 * A textured, single-mesh `.glb` for an SF3D result: one primitive, non-indexed (every triangle has
 * its own atlas slot, so corners are never shared in UV space), smooth normals carried over from the
 * welded surface, and the baked atlas embedded as a PNG `baseColorTexture`. The design kernel's
 * `gltf-writer.ts` writes untextured parts; this is the one writer that carries an image.
 */

export type TexturedMesh = {
  /** xyz per welded vertex (glTF space, Y up). */
  positions: Float32Array;
  /** Three welded vertex ids per triangle. */
  indices: Uint32Array;
  /** Six floats per triangle: its three corners' UVs. */
  uvs: Float32Array;
  png: Uint8Array;
  name: string;
  roughness: number;
  metalness: number;
};

/** Area-weighted vertex normals of the welded surface. */
export function vertexNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t]! * 3, b = indices[t + 1]! * 3, c = indices[t + 2]! * 3;
    const ux = positions[b]! - positions[a]!, uy = positions[b + 1]! - positions[a + 1]!, uz = positions[b + 2]! - positions[a + 2]!;
    const vx = positions[c]! - positions[a]!, vy = positions[c + 1]! - positions[a + 1]!, vz = positions[c + 2]! - positions[a + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) {
      normals[i]! += nx;
      normals[i + 1]! += ny;
      normals[i + 2]! += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!) || 1;
    normals[i]! /= len;
    normals[i + 1]! /= len;
    normals[i + 2]! /= len;
  }
  return normals;
}

const pad4 = (n: number) => (n + 3) & ~3;

export function writeTexturedGlb(mesh: TexturedMesh): Buffer {
  const triangles = mesh.indices.length / 3;
  const count = triangles * 3;
  const welded = vertexNormals(mesh.positions, mesh.indices);
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i += 1) {
    const v = mesh.indices[i]! * 3;
    for (let k = 0; k < 3; k += 1) {
      const p = mesh.positions[v + k]!;
      pos[i * 3 + k] = p;
      nor[i * 3 + k] = welded[v + k]!;
      if (p < min[k]!) min[k] = p;
      if (p > max[k]!) max[k] = p;
    }
    uv[i * 2] = mesh.uvs[i * 2]!;
    uv[i * 2 + 1] = mesh.uvs[i * 2 + 1]!;
  }
  if (count === 0) {
    min.fill(0);
    max.fill(0);
  }

  const views: { data: Uint8Array; target?: number }[] = [
    { data: new Uint8Array(pos.buffer), target: 34962 },
    { data: new Uint8Array(nor.buffer), target: 34962 },
    { data: new Uint8Array(uv.buffer), target: 34962 },
    { data: mesh.png },
  ];
  let offset = 0;
  const bufferViews = views.map((view) => {
    const entry = { buffer: 0, byteOffset: offset, byteLength: view.data.byteLength, ...(view.target ? { target: view.target } : {}) };
    offset += pad4(view.data.byteLength);
    return entry;
  });
  const json = {
    asset: { version: '2.0', generator: 'Midnite Studio SF3D (Stable Fast 3D, ONNX)' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: mesh.name, mesh: 0 }],
    meshes: [{ name: mesh.name, primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, material: 0, mode: 4 }] }],
    materials: [
      {
        name: `${mesh.name}-material`,
        pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: mesh.metalness, roughnessFactor: mesh.roughness },
        doubleSided: false,
      },
    ],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{ magFilter: 9729, minFilter: 9729, wrapS: 33071, wrapT: 33071 }],
    images: [{ bufferView: 3, mimeType: 'image/png' }],
    accessors: [
      { bufferView: 0, componentType: 5126, count, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count, type: 'VEC2' },
    ],
    bufferViews,
    buffers: [{ byteLength: offset }],
  };

  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonLength = pad4(jsonBytes.length);
  const total = 12 + 8 + jsonLength + 8 + offset;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0); // glTF
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonLength, 12);
  out.writeUInt32LE(0x4e4f534a, 16); // JSON
  jsonBytes.copy(out, 20);
  out.fill(0x20, 20 + jsonBytes.length, 20 + jsonLength);
  const binStart = 20 + jsonLength;
  out.writeUInt32LE(offset, binStart);
  out.writeUInt32LE(0x004e4942, binStart + 4); // BIN
  views.forEach((view, i) => Buffer.from(view.data.buffer, view.data.byteOffset, view.data.byteLength).copy(out, binStart + 8 + bufferViews[i]!.byteOffset));
  return out;
}
