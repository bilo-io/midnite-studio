import { buildScene, ModelSpecSchema, sceneBounds } from '@midnite/studio-shared';
import { Box3, Color, Mesh, MeshPhongMaterial, MeshStandardMaterial, type Object3D } from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { describe, expect, it } from 'vitest';

import { writeFbxAscii, writeFbxBinary } from './fbx-writer';
import { buildGltf, writeGlb } from './gltf-writer';
import { writeMtl, writeObj } from './obj-writer';

/** The new geometry and material fields through every exporter: CSG, a modifier stack, a group, an instance, PBR. */
const spec = ModelSpecSchema.parse({
  name: 'fidelity',
  parts: [
    { id: 'block', name: 'block', shape: 'roundedBox', size: [2, 1, 1], radius: 0.1, color: '#b87333', material: { metalness: 1, roughness: 0.25 } },
    { name: 'bore', shape: 'cylinder', radiusTop: 0.2, radiusBottom: 0.2, height: 3, segments: 16, op: 'subtract', target: 'block', rotation: [90, 0, 0] },
    { id: 'rig', name: 'rig', shape: 'group', position: [0, 2, 0] },
    { name: 'lamp', shape: 'sphere', radius: 0.3, parent: 'rig', color: '#ffee88', material: { emissive: '#ffcc00', emissiveIntensity: 2, opacity: 0.6 } },
    { id: 'post', name: 'post', shape: 'capsule', radius: 0.1, height: 1, parent: 'rig', position: [1, 0, 0], modifiers: [{ type: 'taper', amount: 0.5, axis: 'y' }] },
    { name: 'post2', shape: 'instance', source: 'post', position: [-3, 0, 0] },
  ],
});
const parts = buildScene(spec);
const ab = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const meshes = (root: Object3D): Mesh[] => {
  const out: Mesh[] = [];
  root.traverse((c) => (c as Mesh).isMesh && out.push(c as Mesh));
  return out;
};
const tris = (m: Mesh): number => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position!.count) / 3;
const srgb = (hex: string): Color => new Color().setStyle(hex);

describe('exporters carry the richer spec', () => {
  it('builds the expected parts (the bore is consumed)', () => {
    expect(parts.map((p) => p.name)).toEqual(['block', 'lamp', 'post', 'post2']);
  });

  it('glb round-trips geometry and PBR through GLTFLoader', async () => {
    const glb = writeGlb(parts, 'fidelity');
    expect(glb.subarray(0, 4).toString('latin1')).toBe('glTF');
    expect(glb.readUInt32LE(8)).toBe(glb.length);
    const gltf = await new GLTFLoader().parseAsync(ab(glb), '');
    const loaded = meshes(gltf.scene);
    expect(loaded.map(tris)).toEqual(parts.map((p) => p.indices.length / 3));
    const box = new Box3().setFromObject(gltf.scene);
    const bounds = sceneBounds(parts);
    (['x', 'y', 'z'] as const).forEach((k, i) => {
      expect(box.min[k]).toBeCloseTo(bounds.min[i]!, 3);
      expect(box.max[k]).toBeCloseTo(bounds.max[i]!, 3);
    });
    const copper = loaded[0]!.material as MeshStandardMaterial;
    expect(copper.metalness).toBeCloseTo(1, 5);
    expect(copper.roughness).toBeCloseTo(0.25, 5);
    expect(copper.color.getHexString()).toBe(srgb('#b87333').getHexString());
    const lamp = loaded[1]!.material as MeshStandardMaterial;
    expect(lamp.opacity).toBeCloseTo(0.6, 5);
    expect(lamp.transparent).toBe(true);
    expect(lamp.emissiveIntensity).toBeCloseTo(2, 5);
    expect(lamp.emissive.getHexString()).toBe(srgb('#ffcc00').getHexString());
  });

  it('glb json is well formed: aligned views, accessor bounds, deduped materials', () => {
    const { json, bin } = buildGltf(parts);
    expect((json.materials as unknown[]).length).toBe(3);
    for (const view of json.bufferViews as { byteOffset: number }[]) expect(view.byteOffset % 4).toBe(0);
    expect(bin.length).toBe((json.buffers as { byteLength: number }[])[0]!.byteLength);
    expect(json.extensionsUsed).toEqual(['KHR_materials_emissive_strength']);
  });

  it('obj + mtl carry colour, opacity and the PBR extension lines', () => {
    const mtl = writeMtl(parts);
    expect(mtl).toMatch(/^Pm 1$/m);
    expect(mtl).toMatch(/^Pr 0.25$/m);
    expect(mtl).toMatch(/^d 0.6$/m);
    expect(mtl).toMatch(/^Ke 1 1 0$/m);
    const creator = new MTLLoader().parse(mtl, '');
    creator.preload();
    const root = new OBJLoader().setMaterials(creator).parse(writeObj(parts, 'x.mtl'));
    const loaded = meshes(root);
    expect(loaded.map(tris)).toEqual(parts.map((p) => p.indices.length / 3));
    expect(`#${(loaded[0]!.material as MeshPhongMaterial).color.getHexString()}`).toBe('#b87333');
    expect((loaded[1]!.material as MeshPhongMaterial).opacity).toBeCloseTo(0.6, 5);
  });

  it('fbx (binary and ascii) carry geometry, colour, opacity and emissive', () => {
    for (const data of [writeFbxBinary(parts), Buffer.from(writeFbxAscii(parts), 'utf8')]) {
      const loaded = meshes(new FBXLoader().parse(ab(data), ''));
      expect(loaded.map(tris)).toEqual(parts.map((p) => p.indices.length / 3));
      const get = (m: Mesh) => (Array.isArray(m.material) ? m.material[0] : m.material) as MeshPhongMaterial;
      expect(`#${get(loaded[0]!).color.getHexString()}`).toBe('#b87333');
      expect(get(loaded[1]!).opacity).toBeCloseTo(0.6, 5);
      expect(get(loaded[1]!).emissive.getHexString()).toBe('ffcc00');
    }
  });
});
