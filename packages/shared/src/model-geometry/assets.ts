import type { ModelAssetPart, ModelSpec } from '../media-model';

/**
 * Imported meshes — the geometry behind a design's `asset` parts (Phase 103 Theme J: an SF3D result,
 * or any `.glb` dropped into a model's folder).
 *
 * The kernel is synchronous and touches no disk, so an asset part does not carry its geometry: it names
 * a `.glb` beside the design (`src`) and that file's content hash (`hash`). Whoever builds the design —
 * main before an export, a preview or an MCP edit, the editor after fetching the file — parses the file
 * with {@link parseGlbMesh} and registers it here under its hash; `buildScene` then resolves the part by
 * hash. Keying by content rather than by path makes the registry safe to share across repositories and
 * models (two copies of one file are one entry) and means a changed file can never stand in for the
 * one a design was built from.
 */

export type ModelAssetTexture = { mime: string; data: Uint8Array };

export type ModelAssetMesh = {
  /** xyz triples in the asset's own space (the `.glb`'s scene, node transforms applied). */
  positions: number[];
  /** Unit normals, one per position. */
  normals: number[];
  indices: number[];
  /** uv pairs, one per position, or `null` when the file has none. */
  uvs: number[] | null;
  /** The base-colour texture's encoded image (PNG/JPEG), or `null`. */
  texture: ModelAssetTexture | null;
  /** The file's first material, sRGB colour. */
  material: { color: string; metalness: number; roughness: number };
};

// --- the content hash ---------------------------------------------------------------------------

/**
 * A 128-bit non-cryptographic hash of a file's bytes (four seeded 32-bit lanes of a multiply-xorshift
 * mix, as 32 hex characters). It names content for the registry, not trust — pure JS, so the renderer
 * and main compute the same key without `node:crypto`.
 */
export function modelAssetHash(bytes: Uint8Array): string {
  const seeds = [0x9e3779b1, 0x85ebca77, 0xc2b2ae3d, 0x27d4eb2f];
  return seeds
    .map((seed) => {
      let h = (seed ^ bytes.length) >>> 0;
      for (let i = 0; i < bytes.length; i += 1) {
        h = Math.imul(h ^ bytes[i]!, 0x5bd1e995);
        h ^= h >>> 15;
      }
      h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
      h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
      return ((h ^ (h >>> 16)) >>> 0).toString(16).padStart(8, '0');
    })
    .join('');
}

// --- the registry -------------------------------------------------------------------------------

/** Most meshes kept at once; the least recently used goes first. */
export const MODEL_ASSET_CACHE_LIMIT = 24;

const registry = new Map<string, ModelAssetMesh>();
const listeners = new Set<() => void>();
let epoch = 0;

/** Make `mesh` resolvable as `hash`. Registering a hash that is already known only refreshes it. */
export function registerModelAsset(hash: string, mesh: ModelAssetMesh): void {
  const known = registry.has(hash);
  registry.delete(hash);
  registry.set(hash, mesh);
  while (registry.size > MODEL_ASSET_CACHE_LIMIT) registry.delete(registry.keys().next().value!);
  if (known) return;
  epoch += 1;
  for (const listener of listeners) listener();
}

/** The registered mesh for `hash`, or `undefined` when nobody has loaded it yet. */
export function modelAsset(hash: string): ModelAssetMesh | undefined {
  const hit = registry.get(hash);
  if (hit) {
    registry.delete(hash);
    registry.set(hash, hit);
  }
  return hit;
}

export const hasModelAsset = (hash: string): boolean => registry.has(hash);

/** Changes every time a new mesh is registered — what a cached build compares against. */
export const modelAssetEpoch = (): number => epoch;

/** Called after each new registration; returns the unsubscribe. For `useSyncExternalStore`. */
export function subscribeModelAssets(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Tests only: forget every mesh. */
export function clearModelAssets(): void {
  registry.clear();
  epoch += 1;
  for (const listener of listeners) listener();
}

/** The asset parts of a design whose meshes are not registered yet — what a loader must fetch. */
export function missingModelAssets(spec: Pick<ModelSpec, 'parts'>): ModelAssetPart[] {
  const seen = new Set<string>();
  const out: ModelAssetPart[] = [];
  for (const part of spec.parts) {
    if (part.shape !== 'asset' || registry.has(part.hash) || seen.has(part.hash)) continue;
    seen.add(part.hash);
    out.push(part);
  }
  return out;
}

/** `dir` + `src` → the asset file's path inside the media project (`dir` is the design's folder, `''` for flat). */
export const modelAssetPath = (dir: string, src: string): string => (dir ? `${dir.replace(/\/+$/, '')}/${src}` : src);

// --- reading a .glb -----------------------------------------------------------------------------

type Json = Record<string, unknown>;
type Accessor = { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; normalized?: boolean };
type BufferView = { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number };
type Node = { mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] };
type Primitive = { attributes: Record<string, number>; indices?: number; material?: number; mode?: number };

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

/** Column-major 4×4 (glTF's own order). */
type ColMat = number[];
const colIdentity = (): ColMat => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function colMultiply(a: ColMat, b: ColMat): ColMat {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) for (let k = 0; k < 4; k += 1) out[c * 4 + r] = out[c * 4 + r]! + a[k * 4 + r]! * b[c * 4 + k]!;
  return out;
}
function nodeMatrix(node: Node): ColMat {
  if (node.matrix?.length === 16) return [...node.matrix];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const r = [
    1 - 2 * (y! * y! + z! * z!), 2 * (x! * y! + z! * w!), 2 * (x! * z! - y! * w!),
    2 * (x! * y! - z! * w!), 1 - 2 * (x! * x! + z! * z!), 2 * (y! * z! + x! * w!),
    2 * (x! * z! + y! * w!), 2 * (y! * z! - x! * w!), 1 - 2 * (x! * x! + y! * y!),
  ];
  return [r[0]! * sx!, r[1]! * sx!, r[2]! * sx!, 0, r[3]! * sy!, r[4]! * sy!, r[5]! * sy!, 0, r[6]! * sz!, r[7]! * sz!, r[8]! * sz!, 0, tx!, ty!, tz!, 1];
}

const linearToSrgb = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const hex2 = (c: number): string => Math.round(Math.min(1, Math.max(0, linearToSrgb(c))) * 255).toString(16).padStart(2, '0');

/**
 * Every triangle of a binary glTF (`.glb`) as one mesh: node transforms applied (the default scene, or
 * every root), primitives merged, the first material's base-colour texture and factors kept. Throws on
 * a file that is not a `.glb` it can read — callers report that as a build issue.
 */
export function parseGlbMesh(bytes: Uint8Array): ModelAssetMesh {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) throw new Error('Not a binary glTF (.glb) file.');
  if (view.getUint32(4, true) !== 2) throw new Error('Only glTF 2.0 is supported.');
  let json: Json | null = null;
  let bin: Uint8Array | null = null;
  for (let at = 12; at + 8 <= bytes.byteLength; ) {
    const length = view.getUint32(at, true);
    const type = view.getUint32(at + 4, true);
    const chunk = bytes.subarray(at + 8, at + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk)) as Json;
    else if (type === 0x004e4942) bin = chunk;
    at += 8 + length;
  }
  if (!json) throw new Error('The .glb has no JSON chunk.');
  const accessors = (json.accessors ?? []) as Accessor[];
  const views = (json.bufferViews ?? []) as BufferView[];
  const nodes = (json.nodes ?? []) as Node[];
  const meshes = (json.meshes ?? []) as { primitives: Primitive[] }[];
  const materials = (json.materials ?? []) as Json[];

  const viewBytes = (index: number): { data: Uint8Array; stride: number | undefined } => {
    const bv = views[index];
    if (!bv || !bin) throw new Error('The .glb references a buffer it does not carry.');
    return { data: bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength), stride: bv.byteStride };
  };
  const read = (index: number): number[] => {
    const acc = accessors[index];
    if (!acc) throw new Error(`The .glb has no accessor ${index}.`);
    const components = COMPONENTS[acc.type] ?? 1;
    const out = new Array<number>(acc.count * components).fill(0);
    if (acc.bufferView === undefined) return out;
    const { data, stride } = viewBytes(acc.bufferView);
    const size = BYTES[acc.componentType] ?? 4;
    const step = stride ?? size * components;
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const base = acc.byteOffset ?? 0;
    for (let i = 0; i < acc.count; i += 1) {
      for (let k = 0; k < components; k += 1) {
        const at = base + i * step + k * size;
        let v: number;
        switch (acc.componentType) {
          case 5126:
            v = dv.getFloat32(at, true);
            break;
          case 5125:
            v = dv.getUint32(at, true);
            break;
          case 5123:
            v = dv.getUint16(at, true);
            if (acc.normalized) v /= 65535;
            break;
          case 5122:
            v = dv.getInt16(at, true);
            if (acc.normalized) v = Math.max(v / 32767, -1);
            break;
          case 5121:
            v = dv.getUint8(at);
            if (acc.normalized) v /= 255;
            break;
          default:
            v = dv.getInt8(at);
            if (acc.normalized) v = Math.max(v / 127, -1);
        }
        out[i * components + k] = v;
      }
    }
    return out;
  };

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  let anyUv = false;
  let materialIndex: number | undefined;

  const emit = (prim: Primitive, world: ColMat): void => {
    if ((prim.mode ?? 4) !== 4 || prim.attributes.POSITION === undefined) return;
    const p = read(prim.attributes.POSITION);
    const count = p.length / 3;
    const n = prim.attributes.NORMAL !== undefined ? read(prim.attributes.NORMAL) : null;
    const uv = prim.attributes.TEXCOORD_0 !== undefined ? read(prim.attributes.TEXCOORD_0) : null;
    const offset = positions.length / 3;
    for (let i = 0; i < count; i += 1) {
      const [x, y, z] = [p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!];
      positions.push(world[0]! * x + world[4]! * y + world[8]! * z + world[12]!, world[1]! * x + world[5]! * y + world[9]! * z + world[13]!, world[2]! * x + world[6]! * y + world[10]! * z + world[14]!);
      if (n) {
        const [a, b, c] = [n[i * 3]!, n[i * 3 + 1]!, n[i * 3 + 2]!];
        const v = [world[0]! * a + world[4]! * b + world[8]! * c, world[1]! * a + world[5]! * b + world[9]! * c, world[2]! * a + world[6]! * b + world[10]! * c];
        const len = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
        normals.push(v[0]! / len, v[1]! / len, v[2]! / len);
      } else normals.push(Number.NaN, 0, 0);
      uvs.push(uv ? uv[i * 2]! : 0, uv ? uv[i * 2 + 1]! : 0);
    }
    if (uv) anyUv = true;
    const tri = prim.indices !== undefined ? read(prim.indices) : Array.from({ length: count }, (_, i) => i);
    // A mirroring node transform turns the winding inside out; flip it back.
    const det =
      world[0]! * (world[5]! * world[10]! - world[9]! * world[6]!) -
      world[4]! * (world[1]! * world[10]! - world[9]! * world[2]!) +
      world[8]! * (world[1]! * world[6]! - world[5]! * world[2]!);
    for (let i = 0; i + 2 < tri.length; i += 3) {
      if (det < 0) indices.push(offset + tri[i]!, offset + tri[i + 2]!, offset + tri[i + 1]!);
      else indices.push(offset + tri[i]!, offset + tri[i + 1]!, offset + tri[i + 2]!);
    }
    if (materialIndex === undefined && prim.material !== undefined) materialIndex = prim.material;
  };

  const visit = (index: number, parent: ColMat, depth: number): void => {
    const node = nodes[index];
    if (!node || depth > 64) return;
    const world = colMultiply(parent, nodeMatrix(node));
    if (node.mesh !== undefined) for (const prim of meshes[node.mesh]?.primitives ?? []) emit(prim, world);
    for (const child of node.children ?? []) visit(child, world, depth + 1);
  };
  const scenes = (json.scenes ?? []) as { nodes?: number[] }[];
  const scene = scenes[(json.scene as number | undefined) ?? 0];
  let roots = scene?.nodes;
  if (!roots) {
    const childSet = new Set(nodes.flatMap((n) => n.children ?? []));
    roots = nodes.map((_, i) => i).filter((i) => !childSet.has(i));
  }
  for (const root of roots) visit(root, colIdentity(), 0);
  if (indices.length === 0) throw new Error('The .glb has no triangles.');

  // Fill normals the file did not carry: area-weighted face normals.
  if (normals.some((v) => Number.isNaN(v))) {
    const acc = new Array<number>(positions.length).fill(0);
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = [indices[i]! * 3, indices[i + 1]! * 3, indices[i + 2]! * 3];
      const e1 = [positions[b]! - positions[a]!, positions[b + 1]! - positions[a + 1]!, positions[b + 2]! - positions[a + 2]!];
      const e2 = [positions[c]! - positions[a]!, positions[c + 1]! - positions[a + 1]!, positions[c + 2]! - positions[a + 2]!];
      const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
      for (const v of [a, b, c]) for (let k = 0; k < 3; k += 1) acc[v + k] = acc[v + k]! + n[k]!;
    }
    for (let v = 0; v < normals.length; v += 3) {
      if (!Number.isNaN(normals[v]!)) continue;
      const len = Math.hypot(acc[v]!, acc[v + 1]!, acc[v + 2]!) || 1;
      normals[v] = acc[v]! / len;
      normals[v + 1] = acc[v + 1]! / len;
      normals[v + 2] = acc[v + 2]! / len;
    }
  }

  const material = materialIndex !== undefined ? materials[materialIndex] : materials[0];
  const pbr = (material?.pbrMetallicRoughness ?? {}) as Json;
  const factor = (pbr.baseColorFactor as number[] | undefined) ?? [1, 1, 1, 1];
  let texture: ModelAssetTexture | null = null;
  const texIndex = (pbr.baseColorTexture as { index?: number } | undefined)?.index;
  if (texIndex !== undefined) {
    const source = ((json.textures ?? []) as { source?: number }[])[texIndex]?.source;
    const image = source !== undefined ? ((json.images ?? []) as { bufferView?: number; mimeType?: string }[])[source] : undefined;
    if (image?.bufferView !== undefined) texture = { mime: image.mimeType ?? 'image/png', data: viewBytes(image.bufferView).data.slice() };
  }
  return {
    positions,
    normals,
    indices,
    uvs: anyUv ? uvs : null,
    texture,
    material: {
      color: `#${hex2(factor[0] ?? 1)}${hex2(factor[1] ?? 1)}${hex2(factor[2] ?? 1)}`,
      metalness: typeof pbr.metallicFactor === 'number' ? pbr.metallicFactor : 1,
      roughness: typeof pbr.roughnessFactor === 'number' ? pbr.roughnessFactor : 1,
    },
  };
}

/** The bounds of a registered mesh, in its own space. */
export function modelAssetBounds(mesh: Pick<ModelAssetMesh, 'positions'>): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      const v = mesh.positions[i + k]!;
      if (v < min[k]!) min[k] = v;
      if (v > max[k]!) max[k] = v;
    }
  }
  return { min, max };
}
