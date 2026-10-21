import {
  autoRig,
  boneNamesFor,
  buildScene,
  computeSkin,
  type ModelSpec,
  RIG_EXAMPLE_BIPED,
  RIG_EXAMPLE_VEHICLE,
  resolveRig,
  restPose,
  samplePose,
  skinMatrices,
  skinParts,
} from '@midnite/studio-shared';
import { AnimationMixer, type Bone, Box3, type Object3D, type SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';

import { buildGltf, gltfRigging, writeGlb } from './gltf-writer';

/** A rigged design exported to `.glb` and read back through three's own loader — what Blender and engines see. */

const rigged = (base: ModelSpec, anatomy: 'biped' | 'vehicle', clips: string[]): ModelSpec => ({
  ...base,
  anatomy,
  rig: autoRig(base, anatomy)!,
  animations: clips.map((kind) => ({ name: kind, kind: kind as never })),
});

const ab = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const all = <T extends Object3D>(root: Object3D, test: (o: Object3D) => boolean): T[] => {
  const out: T[] = [];
  root.traverse((o) => test(o) && out.push(o as T));
  return out;
};

const biped = rigged(RIG_EXAMPLE_BIPED, 'biped', ['idle', 'walk', 'jump']);
const bipedParts = buildScene(biped);
const bipedRigging = gltfRigging(biped, bipedParts)!;

describe('glb with a skin and animations', () => {
  it('a static design exports exactly as before', () => {
    const parts = buildScene(RIG_EXAMPLE_BIPED);
    expect(gltfRigging(RIG_EXAMPLE_BIPED, parts)).toBeNull();
    const { json } = buildGltf(parts, 'robot', null);
    expect(json.skins).toBeUndefined();
    expect(json.animations).toBeUndefined();
    expect((json.scenes as { nodes: number[] }[])[0]!.nodes).toHaveLength(parts.length);
  });

  it('re-imports as skinned meshes on one skeleton named from the bone table', async () => {
    const gltf = await new GLTFLoader().parseAsync(ab(writeGlb(bipedParts, 'robot', bipedRigging)), '');
    const skinned = all<SkinnedMesh>(gltf.scene, (o) => (o as SkinnedMesh).isSkinnedMesh);
    expect(skinned).toHaveLength(bipedParts.length);
    const bones = skinned[0]!.skeleton.bones.map((b: Bone) => b.name);
    expect(bones).toEqual(bipedRigging.rig.bones.map((b) => b.name));
    expect(bones.every((name) => boneNamesFor('biped').includes(name))).toBe(true);
    expect(bones).toContain('hips');
    // the part called "head" yields the name to the bone
    expect(skinned.map((m) => m.name)).toContain('head_mesh');
    expect(new Set(skinned.map((m) => m.skeleton.bones.length))).toEqual(new Set([bones.length]));
  });

  it('the rest pose is the design: bounds match the unrigged build', async () => {
    const gltf = await new GLTFLoader().parseAsync(ab(writeGlb(bipedParts, 'robot', bipedRigging)), '');
    gltf.scene.updateMatrixWorld(true);
    const box = new Box3();
    for (const mesh of all<SkinnedMesh>(gltf.scene, (o) => (o as SkinnedMesh).isSkinnedMesh)) {
      const p = new Vector3();
      for (let i = 0; i < mesh.geometry.attributes.position!.count; i += 1) box.expandByPoint(mesh.getVertexPosition(i, p).applyMatrix4(mesh.matrixWorld));
    }
    const ref = buildScene(RIG_EXAMPLE_BIPED).flatMap((p) => p.positions);
    const ys = ref.filter((_, i) => i % 3 === 1);
    expect(box.min.y).toBeCloseTo(Math.min(...ys), 3);
    expect(box.max.y).toBeCloseTo(Math.max(...ys), 3);
  });

  it('carries one animation per clip, with a rotation track per bone, and it plays', async () => {
    const gltf = await new GLTFLoader().parseAsync(ab(writeGlb(bipedParts, 'robot', bipedRigging)), '');
    expect(gltf.animations.map((a) => a.name)).toEqual(['idle', 'walk', 'jump']);
    const walk = gltf.animations[1]!;
    const rotations = walk.tracks.filter((t) => t.name.endsWith('.quaternion'));
    expect(rotations).toHaveLength(bipedRigging.rig.bones.length);
    expect(walk.duration).toBeCloseTo(1.1, 2);
    // the jump moves the hips up: a translation track, and the kernel's posed vertices agree with three's
    expect(gltf.animations[2]!.tracks.some((t) => t.name.endsWith('.position'))).toBe(true);
    const mixer = new AnimationMixer(gltf.scene);
    mixer.clipAction(walk).play();
    mixer.update(0.3);
    gltf.scene.updateMatrixWorld(true);
    const index = bipedParts.findIndex((p) => p.name === 'left forearm');
    const mesh = all<SkinnedMesh>(gltf.scene, (o) => (o as SkinnedMesh).isSkinnedMesh)[index]!;
    const rig = resolveRig(biped)!;
    const kernel = skinParts([bipedParts[index]!], [computeSkin(biped, rig, bipedParts)[index]!], skinMatrices(rig, samplePose(rig, biped.animations![1]!, 0.3)))[0]!;
    const p = mesh.getVertexPosition(0, new Vector3()).applyMatrix4(mesh.matrixWorld);
    expect(p.x).toBeCloseTo(kernel.positions[0]!, 2);
    expect(p.y).toBeCloseTo(kernel.positions[1]!, 2);
    expect(p.z).toBeCloseTo(kernel.positions[2]!, 2);
    expect(restPose(rig)).toHaveLength(rig.bones.length);
  });

  it('a vehicle exports its wheel and suspension joints and its drive clip', async () => {
    const car = rigged(RIG_EXAMPLE_VEHICLE, 'vehicle', ['drive']);
    const parts = buildScene(car);
    const gltf = await new GLTFLoader().parseAsync(ab(writeGlb(parts, 'car', gltfRigging(car, parts))), '');
    const names = all<Bone>(gltf.scene, (o) => (o as Bone).isBone).map((b) => b.name);
    expect(names).toEqual(expect.arrayContaining(['root', 'body', 'wheel_FL', 'wheel_RR', 'suspension_FL']));
    expect(gltf.animations.map((a) => a.name)).toEqual(['drive']);
  });
});
