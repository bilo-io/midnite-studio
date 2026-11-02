import { ClipParseError, fpsFrom, type ClipMeta } from './clip-meta';

/**
 * glTF / GLB metadata (Phase 125 Theme B), from the JSON alone: the spec requires `min`/`max` on an animation
 * sampler's input accessor, so a clip's duration needs no buffer. Binary chunks are never read, and an
 * external `.bin` is never opened.
 */

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a;

type Accessor = { count?: number; min?: number[]; max?: number[] };
type Gltf = {
  asset?: { version?: string };
  accessors?: Accessor[];
  nodes?: { name?: string }[];
  skins?: { joints?: number[] }[];
  meshes?: unknown[];
  animations?: { name?: string; channels?: { target?: { node?: number } }[]; samplers?: { input?: number }[] }[];
};

function glbJson(bytes: Uint8Array): unknown {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 20 || view.getUint32(0, true) !== GLB_MAGIC) throw new ClipParseError('This is not a GLB file');
  const total = Math.min(view.getUint32(8, true), bytes.length);
  let at = 12;
  while (at + 8 <= total) {
    const length = view.getUint32(at, true);
    const type = view.getUint32(at + 4, true);
    const start = at + 8;
    if (start + length > bytes.length) throw new ClipParseError('The GLB file is truncated or corrupt');
    if (type === CHUNK_JSON) return JSON.parse(Buffer.from(bytes.subarray(start, start + length)).toString('utf8'));
    at = start + length + ((4 - (length % 4)) % 4);
  }
  throw new ClipParseError('The GLB file has no JSON chunk');
}

/** `.glb` is binary, `.gltf` is the JSON itself; the bytes decide, not the extension. */
export function parseGltf(bytes: Uint8Array): ClipMeta {
  let json: unknown;
  try {
    json = bytes.length >= 4 && new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true) === GLB_MAGIC ? glbJson(bytes) : JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch (error) {
    if (error instanceof ClipParseError) throw error;
    throw new ClipParseError('This is not a readable glTF file');
  }
  if (typeof json !== 'object' || json === null || !(json as Gltf).asset) throw new ClipParseError('This is not a glTF file');
  const gltf = json as Gltf;
  const animations = gltf.animations ?? [];
  if (animations.length === 0) throw new ClipParseError('This glTF file has no animation');

  const warnings: string[] = [];
  let durationSec: number | null = null;
  let frameCount = 0;
  let unreadable = false;
  const driven = new Set<number>();
  for (const animation of animations) {
    for (const sampler of animation.samplers ?? []) {
      const accessor = sampler.input === undefined ? undefined : gltf.accessors?.[sampler.input];
      const max = accessor?.max?.[0];
      const min = accessor?.min?.[0] ?? 0;
      if (typeof max === 'number' && Number.isFinite(max)) durationSec = Math.max(durationSec ?? 0, max - min);
      else unreadable = true;
      if (typeof accessor?.count === 'number') frameCount = Math.max(frameCount, accessor.count);
    }
    for (const channel of animation.channels ?? []) if (typeof channel.target?.node === 'number') driven.add(channel.target.node);
  }
  if (durationSec === null || unreadable) warnings.push('The duration could not be read from every track of this glTF file.');
  if (animations.length > 1) warnings.push(`This file holds ${animations.length} animations; the longest is shown.`);

  const joints = gltf.skins?.[0]?.joints ?? [...driven];
  const boneNames = joints.map((index) => gltf.nodes?.[index]?.name ?? '').filter((name) => name !== '');
  const hasSkin = (gltf.skins?.length ?? 0) > 0 && (gltf.meshes?.length ?? 0) > 0;
  return {
    durationSec,
    frameCount: frameCount > 0 ? frameCount : undefined,
    fps: fpsFrom(frameCount, durationSec),
    boneNames,
    hasSkin,
    takeName: animations.find((a) => a.name)?.name,
    warnings,
  };
}
