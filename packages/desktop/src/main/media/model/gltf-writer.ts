import {
  type BakedClip,
  bakeClip,
  boneLocal,
  computeSkin,
  MAX_INFLUENCES,
  type MeshPart,
  modelAsset,
  modelTexture,
  type ModelSpec,
  type PartSkin,
  qIdentity,
  type ResolvedRig,
  resolveRig,
} from '@midnite/studio-shared';

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
 *
 * An imported `asset` part (an SF3D result) keeps its texture: its uvs go out as `TEXCOORD_0` and its
 * registered image as a `baseColorTexture`, embedded in the binary chunk, on a material of its own.
 */

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const round = (n: number): number => Math.round(n * 1e6) / 1e6;

const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;

type Json = Record<string, unknown>;

/**
 * `EXT_mesh_gpu_instancing` (Phase 105 Theme I): one node per entry, drawn once per instance. `colors`
 * (rgb floats, one per vertex) go out as `COLOR_0`, so a multi-coloured design shares one primitive.
 */
export type GltfInstancing = {
  meshes: { part: MeshPart; translations: Float32Array; rotations: Float32Array; scales: Float32Array; colors?: Float32Array }[];
};

export type GltfBuild = { json: Json; bin: Buffer };

/** A rigged design's skeleton, per-part skins (same order as the parts) and clips baked at 30 fps. */
export type GltfRigging = { rig: ResolvedRig; skins: readonly PartSkin[]; clips: readonly BakedClip[] };

/** The rigging a design exports with, or `null` for a static one (which then exports exactly as before). */
export function gltfRigging(spec: ModelSpec, parts: readonly MeshPart[]): GltfRigging | null {
  const rig = resolveRig(spec);
  if (!rig || rig.bones.length === 0) return null;
  return { rig, skins: computeSkin(spec, rig, parts), clips: (spec.animations ?? []).map((clip) => bakeClip(rig, clip)) };
}

/**
 * The glTF document and its binary payload — separate so a test can read the JSON directly.
 *
 * With `rigging`, the bones become joint nodes (local TRS, so the hierarchy is the rig's), every part
 * a skinned primitive (`JOINTS_0`/`WEIGHTS_0`) bound to one shared skin, and every clip a glTF
 * animation: a rotation channel per bone and a translation channel for each bone that moves.
 */
export function buildGltf(
  basePartsIn: readonly MeshPart[],
  title = 'model',
  rigging: GltfRigging | null = null,
  instancing: GltfInstancing | null = null,
): GltfBuild {
  // Instanced meshes ride after the plain parts, so the material and name tables are shared; `null` leaves `parts === basePartsIn`.
  const baseCount = basePartsIn.length;
  const parts: readonly MeshPart[] = instancing && instancing.meshes.length > 0 ? [...basePartsIn, ...instancing.meshes.map((m) => m.part)] : basePartsIn;
  // Bone names are the contract retargeting reads, so a part that shares one ("head") yields its name.
  const boneNames = new Set(rigging?.rig.bones.map((b) => b.name) ?? []);
  const names = uniqueNames(parts).map((n) => (boneNames.has(n) ? `${n}_mesh` : n));
  const { materials, indexOf } = materialsOf(parts);
  const chunks: Buffer[] = [];
  let length = 0;
  const bufferViews: Json[] = [];
  const accessors: Json[] = [];

  const addView = (data: Buffer, target?: number): number => {
    const padded = Buffer.concat([data, Buffer.alloc((4 - (data.length % 4)) % 4)]);
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: data.length, ...(target ? { target } : {}) });
    chunks.push(padded);
    length += padded.length;
    return bufferViews.length - 1;
  };

  const floats = (values: readonly number[]): Buffer => {
    const out = Buffer.alloc(values.length * 4);
    values.forEach((v, i) => out.writeFloatLE(v, i * 4));
    return out;
  };

  // Textured parts: one image, texture and material per distinct (texture, tint, surface).
  const images: Json[] = [];
  const textures: Json[] = [];
  type Surface = { color: string; material: MeshPart['material']; texture?: number; normal?: number; occlusion?: number };
  const texturedMaterials: Surface[] = [];
  const imageOf = new Map<string, number>();
  const texturedKey = new Map<string, number>();
  /** One glTF texture per distinct image (base colour, normal and occlusion maps share the table). */
  const textureIndex = (hash: string, image: { mime: string; data: Uint8Array }): number => {
    let at = imageOf.get(hash);
    if (at === undefined) {
      images.push({ bufferView: addView(Buffer.from(image.data)), mimeType: image.mime });
      textures.push({ source: images.length - 1, sampler: 0 });
      at = textures.length - 1;
      imageOf.set(hash, at);
    }
    return at;
  };
  const materialFor = (part: MeshPart, index: number): number => {
    const base = part.texture ? modelAsset(part.texture)?.texture : undefined;
    const normalImage = part.maps?.normal ? modelTexture(part.maps.normal.hash) : undefined;
    const occlusionImage = part.maps?.ao ? modelTexture(part.maps.ao.hash) : undefined;
    if (!part.uvs || (!base && !normalImage && !occlusionImage)) return indexOf[index]!;
    const texture = base ? textureIndex(part.texture!, base) : undefined;
    const normal = normalImage ? textureIndex(part.maps!.normal!.hash, normalImage) : undefined;
    const occlusion = occlusionImage ? textureIndex(part.maps!.ao!.hash, occlusionImage) : undefined;
    const key = [texture, normal, occlusion, part.color, part.material.metalness, part.material.roughness, part.material.opacity, part.material.emissive, part.material.emissiveIntensity].join('|');
    let at = texturedKey.get(key);
    if (at === undefined) {
      texturedMaterials.push({
        color: part.color,
        material: part.material,
        ...(texture !== undefined ? { texture } : {}),
        ...(normal !== undefined ? { normal } : {}),
        ...(occlusion !== undefined ? { occlusion } : {}),
      });
      at = materials.length + texturedMaterials.length - 1;
      texturedKey.set(key, at);
    }
    return at;
  };

  const meshes: Json[] = [];
  const nodes: Json[] = [];
  const meshNodes: number[] = [];
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

    const attributes: Json = { POSITION: positionAccessor, NORMAL: normalAccessor };
    if (part.uvs && part.uvs.length === vertexCount * 2) {
      attributes.TEXCOORD_0 = accessors.length;
      accessors.push({ bufferView: addView(floats(part.uvs), ARRAY_BUFFER), componentType: FLOAT, count: vertexCount, type: 'VEC2' });
    }
    const skin = rigging?.skins[index];
    if (skin) {
      const joints = Buffer.alloc(vertexCount * MAX_INFLUENCES * 2);
      skin.joints.forEach((j, i) => joints.writeUInt16LE(j, i * 2));
      attributes.JOINTS_0 = accessors.length;
      accessors.push({ bufferView: addView(joints, ARRAY_BUFFER), componentType: UNSIGNED_SHORT, count: vertexCount, type: 'VEC4' });
      attributes.WEIGHTS_0 = accessors.length;
      accessors.push({ bufferView: addView(floats(skin.weights), ARRAY_BUFFER), componentType: FLOAT, count: vertexCount, type: 'VEC4' });
    }

    const instanced = index >= baseCount ? instancing!.meshes[index - baseCount]! : null;
    if (instanced?.colors && instanced.colors.length === vertexCount * 3) {
      attributes.COLOR_0 = accessors.length;
      accessors.push({ bufferView: addView(floats(Array.from(instanced.colors)), ARRAY_BUFFER), componentType: FLOAT, count: vertexCount, type: 'VEC3' });
    }
    let instanceExtension: Json | undefined;
    if (instanced) {
      const count = instanced.translations.length / 3;
      const attr = (data: Float32Array, type: 'VEC3' | 'VEC4'): number => {
        accessors.push({ bufferView: addView(floats(Array.from(data))), componentType: FLOAT, count, type });
        return accessors.length - 1;
      };
      instanceExtension = {
        EXT_mesh_gpu_instancing: {
          attributes: { TRANSLATION: attr(instanced.translations, 'VEC3'), ROTATION: attr(instanced.rotations, 'VEC4'), SCALE: attr(instanced.scales, 'VEC3') },
        },
      };
    }

    meshes.push({
      name: names[index],
      primitives: [{ attributes, indices: indexAccessor, material: materialFor(part, index), mode: 4 }],
    });
    nodes.push({ name: names[index], mesh: meshes.length - 1, ...(skin ? { skin: 0 } : {}), ...(instanceExtension ? { extensions: instanceExtension } : {}) });
    meshNodes.push(nodes.length - 1);
  });

  const sceneNodes = [...meshNodes];
  let skins: Json[] | undefined;
  let animations: Json[] | undefined;
  if (rigging) {
    const { rig } = rigging;
    const jointBase = nodes.length;
    rig.bones.forEach((bone, i) => {
      const local = boneLocal(rig, i, { rotation: qIdentity(), translation: [0, 0, 0] });
      const children = rig.children[i]!.map((c) => jointBase + c);
      nodes.push({ name: bone.name, translation: local.translation.map(round), ...(children.length > 0 ? { children } : {}) });
      if (bone.parent === null) sceneNodes.push(jointBase + i);
    });
    const joints = rig.bones.map((_, i) => jointBase + i);
    // Inverse bind = translation(-head); glTF matrices are column-major, so the offset sits in the last column.
    const inverseBind = rig.bones.flatMap((b) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -b.head[0], -b.head[1], -b.head[2], 1]);
    const ibm = accessors.length;
    accessors.push({ bufferView: addView(floats(inverseBind)), componentType: FLOAT, count: rig.bones.length, type: 'MAT4' });
    const rootJoint = rig.bones.findIndex((b) => b.parent === null);
    skins = [{ name: 'skeleton', joints, inverseBindMatrices: ibm, ...(rootJoint >= 0 ? { skeleton: jointBase + rootJoint } : {}) }];

    animations = rigging.clips.map((clip) => {
      const samplers: Json[] = [];
      const channels: Json[] = [];
      const input = accessors.length;
      accessors.push({
        bufferView: addView(floats(clip.times)),
        componentType: FLOAT,
        count: clip.times.length,
        type: 'SCALAR',
        min: [clip.times[0] ?? 0],
        max: [clip.times[clip.times.length - 1] ?? 0],
      });
      const channel = (node: number, path: 'rotation' | 'translation', values: number[], type: 'VEC4' | 'VEC3'): void => {
        const output = accessors.length;
        accessors.push({ bufferView: addView(floats(values)), componentType: FLOAT, count: clip.times.length, type });
        samplers.push({ input, output, interpolation: 'LINEAR' });
        channels.push({ sampler: samplers.length - 1, target: { node, path } });
      };
      rig.bones.forEach((_, i) => {
        channel(jointBase + i, 'rotation', clip.rotations[i]!.flat(), 'VEC4');
        const moves = clip.translations[i]!.some((t) => t[0] !== 0 || t[1] !== 0 || t[2] !== 0);
        if (moves) {
          const values = clip.rotations[i]!.flatMap((rotation, f) => boneLocal(rig, i, { rotation, translation: clip.translations[i]![f]! }).translation);
          channel(jointBase + i, 'translation', values, 'VEC3');
        }
      });
      return { name: clip.name, samplers, channels, extras: { loop: clip.loop } };
    });
  }

  const allMaterials: Surface[] = [...materials, ...texturedMaterials];
  const usesEmissiveStrength = allMaterials.some((m) => m.material.emissive !== '#000000' && m.material.emissiveIntensity > 1);
  const gltfMaterials = allMaterials.map((entry, index) => {
    const [r, g, b] = hexToRgb(entry.color).map(srgbToLinear);
    const { metalness, roughness, opacity, emissive, emissiveIntensity } = entry.material;
    const glow = hexToRgb(emissive).map(srgbToLinear);
    const material: Json = {
      name: `material_${index + 1}`,
      pbrMetallicRoughness: { baseColorFactor: [round(r!), round(g!), round(b!), round(opacity)], metallicFactor: round(metalness), roughnessFactor: round(roughness) },
      doubleSided: false,
    };
    if (entry.texture !== undefined) (material.pbrMetallicRoughness as Json).baseColorTexture = { index: entry.texture };
    if (entry.normal !== undefined) material.normalTexture = { index: entry.normal };
    if (entry.occlusion !== undefined) material.occlusionTexture = { index: entry.occlusion };
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
    scenes: [{ name: title, nodes: sceneNodes }],
    nodes,
    meshes,
    ...(skins ? { skins } : {}),
    ...(animations && animations.length > 0 ? { animations } : {}),
    materials: gltfMaterials,
    ...(textures.length > 0 ? { textures, images, samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }] } : {}),
    accessors,
    bufferViews,
    buffers: [{ byteLength: length }],
  };
  const used = [...(usesEmissiveStrength ? ['KHR_materials_emissive_strength'] : []), ...(instancing && instancing.meshes.length > 0 ? ['EXT_mesh_gpu_instancing'] : [])];
  if (used.length > 0) json.extensionsUsed = used;
  return { json, bin: Buffer.concat(chunks) };
}

/** The `.glb` container: header, a space-padded JSON chunk, a zero-padded BIN chunk. */
export function writeGlb(parts: readonly MeshPart[], title = 'model', rigging: GltfRigging | null = null, instancing: GltfInstancing | null = null): Buffer {
  const { json, bin } = buildGltf(parts, title, rigging, instancing);
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
