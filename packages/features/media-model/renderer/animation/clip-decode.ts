import type { AnimationFormat, AnimationReadResult } from '@midnite/studio-shared';
import type { AnimationClip, Object3D } from 'three';

/**
 * Decodes a library clip's bytes into a three.js `AnimationClip` (Phase 125 Theme D) with three's own loaders
 * (FBX, glTF, BVH), imported lazily so the entry chunk never carries them. The decoded clip is plain three
 * data; the preview and the lane view both read it.
 */
export type DecodedClip = {
  clip: AnimationClip;
  /** The skeleton or scene that came with the clip, to play it on in "own skeleton" mode; `null` when the file has none. */
  root: Object3D | null;
  /** True for a BVH clip, whose tracks address `.bones[name]` and need a `SkeletonHelper` as mixer root. */
  bvh: boolean;
  /** The skeleton of a BVH clip. */
  skeleton: import('three').Skeleton | null;
};

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

const hasBone = (root: Object3D): boolean => {
  let found = false;
  root.traverse((child) => {
    if ((child as { isBone?: boolean }).isBone) found = true;
  });
  return found;
};

export async function decodeClip(read: Pick<AnimationReadResult, 'format' | 'dataBase64'>): Promise<DecodedClip> {
  const bytes = base64ToBytes(read.dataBase64);
  return decodeBytes(read.format, bytes);
}

export async function decodeBytes(format: AnimationFormat, bytes: Uint8Array): Promise<DecodedClip> {
  if (format === 'fbx') {
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
    const group = new FBXLoader().parse(toArrayBuffer(bytes), '');
    const clip = group.animations[0];
    if (!clip) throw new Error('This FBX file has no animation.');
    return { clip, root: hasBone(group) ? group : null, bvh: false, skeleton: null };
  }
  if (format === 'glb' || format === 'gltf') {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().parseAsync(format === 'gltf' ? new TextDecoder().decode(bytes) : toArrayBuffer(bytes), '');
    const clip = gltf.animations[0];
    if (!clip) throw new Error('This file has no animation.');
    return { clip, root: hasBone(gltf.scene) ? gltf.scene : null, bvh: false, skeleton: null };
  }
  const { BVHLoader } = await import('three/examples/jsm/loaders/BVHLoader.js');
  const result = new BVHLoader().parse(new TextDecoder().decode(bytes));
  return { clip: result.clip, root: result.skeleton.bones[0] ?? null, bvh: true, skeleton: result.skeleton };
}
