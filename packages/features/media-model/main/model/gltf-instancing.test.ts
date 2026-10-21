import { createHash } from 'node:crypto';

import { buildScene, ModelSpecSchema } from '@midnite/studio-shared';
import { InstancedMesh, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';

import { buildGltf, writeGlb } from './gltf-writer';

const spec = ModelSpecSchema.parse({
  name: 'tree',
  parts: [{ name: 'trunk', shape: 'cylinder', radiusTop: 0.2, radiusBottom: 0.3, height: 2, segments: 8, color: '#664422' }],
});
const parts = buildScene(spec);
const ab = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

describe('EXT_mesh_gpu_instancing', () => {
  it('a 3-instance mesh round-trips through GLTFLoader as one InstancedMesh with count 3', async () => {
    const part = parts[0]!;
    const glb = writeGlb([], 'inst', null, {
      meshes: [
        {
          part,
          translations: new Float32Array([0, 0, 0, 5, 0, 0, 0, 0, 7]),
          rotations: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
          scales: new Float32Array([1, 1, 1, 2, 2, 2, 1, 1, 1]),
        },
      ],
    });
    const gltf = await new GLTFLoader().parseAsync(ab(glb), '');
    const found: InstancedMesh[] = [];
    gltf.scene.traverse((o: Object3D) => (o as InstancedMesh).isInstancedMesh && found.push(o as InstancedMesh));
    expect(found).toHaveLength(1);
    expect(found[0]!.count).toBe(3);
    const { json } = buildGltf([], 'inst', null, { meshes: [{ part, translations: new Float32Array(3), rotations: new Float32Array(4), scales: new Float32Array(3) }] });
    expect(json.extensionsUsed).toContain('EXT_mesh_gpu_instancing');
    expect(json.extensionsRequired).toBeUndefined();
  });

  it('without instancing the output is byte-identical to what it was before the parameter existed', () => {
    const plain = writeGlb(parts, 'model');
    expect(writeGlb(parts, 'model', null, null).equals(plain)).toBe(true);
    expect(writeGlb(parts, 'model', null, { meshes: [] }).equals(plain)).toBe(true);
    expect(createHash('sha256').update(plain).digest('hex')).toBe('758c63a9f3608ec18bd59a283a24bb6cf1dba1513c49ba33ee4fbd05d1ecc63e');
  });
});
