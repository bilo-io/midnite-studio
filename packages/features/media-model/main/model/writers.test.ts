import { buildScene, ModelSpecSchema, sceneBounds } from '@midnite/studio-shared';
import { Box3, Group, Mesh, MeshPhongMaterial, type Object3D } from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { describe, expect, it } from 'vitest';

import { writeFbxAscii, writeFbxBinary } from './fbx-writer';
import { formatNumber, safeName, uniqueNames, writeMtl, writeObj } from './obj-writer';

const spec = ModelSpecSchema.parse({
  name: 'robot',
  parts: [
    { name: 'body', shape: 'box', size: [2, 3, 1], position: [0, 1.5, 0], color: '#3366cc' },
    { name: 'head', shape: 'sphere', radius: 0.7, position: [0, 3.7, 0], color: '#ffcc00' },
    { name: 'arm', shape: 'cylinder', radiusTop: 0.2, radiusBottom: 0.2, height: 2, position: [1.4, 1.5, 0], rotation: [0, 0, 30], color: '#3366cc' },
    { name: 'arm', shape: 'cone', radius: 0.4, height: 1, position: [-1.4, 1.5, 0], color: '#cc3333' },
  ],
});
const parts = buildScene(spec);

const meshes = (root: Object3D): Mesh[] => {
  const found: Mesh[] = [];
  root.traverse((child) => {
    if ((child as Mesh).isMesh) found.push(child as Mesh);
  });
  return found;
};
const triangleCount = (mesh: Mesh): number => (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position!.count) / 3;
const expectedTriangles = parts.map((part) => part.indices.length / 3);
const toArrayBuffer = (buffer: Buffer): ArrayBuffer => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

function expectMatchesScene(root: Group): void {
  const loaded = meshes(root);
  expect(loaded).toHaveLength(parts.length);
  expect(loaded.map(triangleCount)).toEqual(expectedTriangles);
  const box = new Box3().setFromObject(root);
  const bounds = sceneBounds(parts);
  for (const [axis, key] of ['x', 'y', 'z'].entries()) {
    expect(box.min[key as 'x'], `min ${key}`).toBeCloseTo(bounds.min[axis]!, 3);
    expect(box.max[key as 'x'], `max ${key}`).toBeCloseTo(bounds.max[axis]!, 3);
  }
}

describe('obj writer', () => {
  const obj = writeObj(parts, 'robot.mtl');

  it('formats numbers without exponents or negative zero', () => {
    expect(formatNumber(1.5)).toBe('1.5');
    expect(formatNumber(-0.0000001)).toBe('0');
    expect(formatNumber(2)).toBe('2');
    expect(formatNumber(1e-7 + 3)).toBe('3');
  });

  it('names objects safely and uniquely', () => {
    expect(safeName(' left arm! ', 'x')).toBe('left_arm');
    expect(safeName('***', 'part3')).toBe('part3');
    expect(uniqueNames(parts)).toEqual(['body', 'head', 'arm', 'arm_2']);
  });

  it('dedupes materials by colour', () => {
    expect(writeMtl(parts).match(/^newmtl /gm)).toHaveLength(3);
  });

  it('re-imports through OBJLoader with every part and its bounds', () => {
    const root = new OBJLoader().parse(obj);
    expectMatchesScene(root);
    expect(root.children.map((c) => c.name)).toEqual(['body', 'head', 'arm', 'arm_2']);
  });

  it('carries colours through MTLLoader', () => {
    const creator = new MTLLoader().parse(writeMtl(parts), '');
    creator.preload();
    const root = new OBJLoader().setMaterials(creator).parse(obj);
    const body = meshes(root).find((mesh) => mesh.name === 'body')!;
    const material = body.material as MeshPhongMaterial;
    expect(`#${material.color.getHexString()}`).toBe('#3366cc');
  });
});

describe('fbx writer', () => {
  it('re-imports the binary encoding through FBXLoader', () => {
    const buffer = writeFbxBinary(parts);
    expect(buffer.subarray(0, 18).toString('latin1')).toBe('Kaydara FBX Binary');
    expectMatchesScene(new FBXLoader().parse(toArrayBuffer(buffer), ''));
  });

  it('re-imports the ascii encoding through FBXLoader', () => {
    const text = writeFbxAscii(parts);
    expect(text.startsWith('; FBX 7.4.0 project file')).toBe(true);
    expectMatchesScene(new FBXLoader().parse(toArrayBuffer(Buffer.from(text, 'utf8')), ''));
  });

  it('keeps per-part colour in both encodings', () => {
    for (const data of [Buffer.from(writeFbxAscii(parts), 'utf8'), writeFbxBinary(parts)]) {
      const root = new FBXLoader().parse(toArrayBuffer(data), '');
      const colours = meshes(root).map((mesh) => {
        const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as MeshPhongMaterial;
        return `#${material.color.getHexString()}`;
      });
      expect(colours).toEqual(['#3366cc', '#ffcc00', '#3366cc', '#cc3333']);
    }
  });

  it('names models after the parts', () => {
    const root = new FBXLoader().parse(toArrayBuffer(writeFbxBinary(parts)), '');
    expect(root.children.map((c) => c.name)).toEqual(['body', 'head', 'arm', 'arm_2']);
  });
});
