import type { MeshPart } from '@midnite/studio-shared';

import { hexToRgb, materialsOf, uniqueNames } from './obj-writer';

/**
 * glTF 2.0 binary (`.glb`) — the one export that carries PBR faithfully: `pbrMetallicRoughness`
 * (base colour, metalness, roughness), emissive colour (+ `KHR_materials_emissive_strength` past 1)
 * and opacity (`alphaMode: BLEND`). Hand-written rather than three's `GLTFExporter`, which wants a
 * DOM (`FileReader`/`Blob`/canvas) main does not have; for flat-coloured meshes the format is small.
 *
 * One node + mesh + primitive per part, geometry already in world space (like the OBJ/FBX), Y up,
 * right-handed, metres — exactly glTF's convention. Colours are sRGB in the design and **linear** in
 * glTF, so they are converted. `gltf-writer.test.ts` round-trips through three's `GLTFLoader`.
 */

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const round = (n: number): number => Math.round(n * 1e6) / 1e6;

const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;

type Json = Record<string, unknown>;

export type GltfBuild = { json: Json; bin: Buffer };

/** The glTF document and its binary payload — separate so a test can read the JSON directly. */
export function buildGltf(parts: readonly MeshPart[], title = 'model'): GltfBuild {
  const names = uniqueNames(parts);
  const { materials, indexOf } = materialsOf(parts);
  const chunks: Buffer[] = [];
  let length = 0;
  const bufferViews: Json[] = [];
  const accessors: Json[] = [];

  const addView = (data: Buffer, target: number): number => {
    const padded = Buffer.concat([data, Buffer.alloc((4 - (data.length % 4)) % 4)]);
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: data.length, target });
    chunks.push(padded);
    length += padded.length;
    return bufferViews.length - 1;
  };

  const meshes: Json[] = [];
  const nodes: Json[] = [];
  parts.forEach((part, index) => {
    if (part.indices.length === 0) return;
    const vertexCount = part.positions.length / 3;
    const positions = Buffer.alloc(part.positions.length * 4);
    part.positions.forEach((v, i) => positions.writeFloatLE(v, i * 4));
    const normals = Buffer.alloc(part.normals.length * 4);
    part.normals.forEach((v, i) => normals.writeFloatLE(v, i * 4));
    const wide = vertexCount > 65535;
    const indices = Buffer.alloc(part.indices.length * (wide ? 4 : 2));
    part.indices.forEach((v, i) => (wide ? indices.writeUInt32LE(v, i * 4) : indices.writeUInt16LE(v, i * 2)));

    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < part.positions.length; i += 3) {
      for (let k = 0; k < 3; k += 1) {
        min[k] = Math.min(min[k]!, part.positions[i + k]!);
        max[k] = Math.max(max[k]!, part.positions[i + k]!);
      }
    }
    const positionAccessor = accessors.length;
    accessors.push({ bufferView: addView(positions, ARRAY_BUFFER), componentType: FLOAT, count: vertexCount, type: 'VEC3', min: min.map(round), max: max.map(round) });
    const normalAccessor = accessors.length;
    accessors.push({ bufferView: addView(normals, ARRAY_BUFFER), componentType: FLOAT, count: vertexCount, type: 'VEC3' });
    const indexAccessor = accessors.length;
    accessors.push({ bufferView: addView(indices, ELEMENT_ARRAY_BUFFER), componentType: wide ? UNSIGNED_INT : UNSIGNED_SHORT, count: part.indices.length, type: 'SCALAR' });

    meshes.push({
      name: names[index],
      primitives: [{ attributes: { POSITION: positionAccessor, NORMAL: normalAccessor }, indices: indexAccessor, material: indexOf[index], mode: 4 }],
    });
    nodes.push({ name: names[index], mesh: meshes.length - 1 });
  });

  const usesEmissiveStrength = materials.some((m) => m.material.emissive !== '#000000' && m.material.emissiveIntensity > 1);
  const gltfMaterials = materials.map((entry, index) => {
    const [r, g, b] = hexToRgb(entry.color).map(srgbToLinear);
    const { metalness, roughness, opacity, emissive, emissiveIntensity } = entry.material;
    const glow = hexToRgb(emissive).map(srgbToLinear);
    const material: Json = {
      name: `material_${index + 1}`,
      pbrMetallicRoughness: { baseColorFactor: [round(r!), round(g!), round(b!), round(opacity)], metallicFactor: round(metalness), roughnessFactor: round(roughness) },
      doubleSided: false,
    };
    if (opacity < 1) material.alphaMode = 'BLEND';
    if (emissive !== '#000000') {
      const scale = Math.min(1, emissiveIntensity);
      material.emissiveFactor = glow.map((c) => round(c * scale));
      if (emissiveIntensity > 1) material.extensions = { KHR_materials_emissive_strength: { emissiveStrength: round(emissiveIntensity) } };
    }
    return material;
  });

  const json: Json = {
    asset: { version: '2.0', generator: 'Midnite Studio', extras: { title } },
    scene: 0,
    scenes: [{ name: title, nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials: gltfMaterials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: length }],
  };
  if (usesEmissiveStrength) json.extensionsUsed = ['KHR_materials_emissive_strength'];
  return { json, bin: Buffer.concat(chunks) };
}

/** The `.glb` container: header, a space-padded JSON chunk, a zero-padded BIN chunk. */
export function writeGlb(parts: readonly MeshPart[], title = 'model'): Buffer {
  const { json, bin } = buildGltf(parts, title);
  const jsonText = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonChunk = Buffer.concat([jsonText, Buffer.alloc((4 - (jsonText.length % 4)) % 4, 0x20)]);
  const binChunk = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const total = 12 + 8 + jsonChunk.length + (binChunk.length > 0 ? 8 + binChunk.length : 0);
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'latin1');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jsonHead = Buffer.alloc(8);
  jsonHead.writeUInt32LE(jsonChunk.length, 0);
  jsonHead.writeUInt32LE(0x4e4f534a, 4);
  const out = [header, jsonHead, jsonChunk];
  if (binChunk.length > 0) {
    const binHead = Buffer.alloc(8);
    binHead.writeUInt32LE(binChunk.length, 0);
    binHead.writeUInt32LE(0x004e4942, 4);
    out.push(binHead, binChunk);
  }
  return Buffer.concat(out);
}
