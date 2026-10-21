import { describe, expect, it } from 'vitest';

import { decodeMeshBin, encodeMeshBin, MeshBinError, readMeshBinHeader } from './mesh-bin';
import { cube } from './pipeline-fixtures';
import { unwrapMesh } from './uv';

describe('mesh.bin with uvs (version 2)', () => {
  it('round-trips uvs byte for byte, and writes a uv-less file as version 1 exactly as before', () => {
    const c = cube();
    const plain = encodeMeshBin({ positions: c.positions, normals: new Float32Array(c.positions.length), indices: c.indices, multiresLevel: 0 });
    expect(readMeshBinHeader(plain).version).toBe(1);
    const unwrapped = unwrapMesh(c);
    const withUv = encodeMeshBin({ positions: unwrapped.positions, normals: new Float32Array(unwrapped.positions.length), indices: unwrapped.indices, multiresLevel: 0, uvs: unwrapped.uvs });
    expect(readMeshBinHeader(withUv).version).toBe(2);
    const back = decodeMeshBin(withUv);
    expect(Array.from(back.uvs!)).toEqual(Array.from(unwrapped.uvs));
    expect(encodeMeshBin(back)).toEqual(withUv);
    expect(decodeMeshBin(plain).uvs).toBeUndefined();
  });

  it('refuses a uv count that does not match, and a version-1 file that claims uvs', () => {
    const c = cube();
    expect(() => encodeMeshBin({ positions: c.positions, normals: new Float32Array(c.positions.length), indices: c.indices, multiresLevel: 0, uvs: new Float32Array(3) })).toThrow(MeshBinError);
    const plain = encodeMeshBin({ positions: c.positions, normals: new Float32Array(c.positions.length), indices: c.indices, multiresLevel: 0 });
    new DataView(plain.buffer).setUint16(10, 2, true);
    expect(() => decodeMeshBin(plain)).toThrow(/uvs|corrupt|header/);
  });
});
