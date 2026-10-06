import { afterEach, describe, expect, it } from 'vitest';

import { ModelSidecarSchema, ModelSpecSchema } from '../../media-model';
import { buildModelManifest, modelSculptSummary } from '../../media-model-library';
import { clearModelAssets, missingSculptMeshes, modelAssetHash, registerSculptMesh } from '../assets';
import { buildSceneChecked, semanticIssues } from '../scene';
import { Bvh, intersectTriangle } from './bvh';
import { EditableMesh } from './editable-mesh';
import { decodeMeshBin, encodeMeshBin, MESH_BIN_HEADER_BYTES, MeshBinError, readMeshBinHeader, sculptMeshSrcFor } from './mesh-bin';
import { appendOps, opsLogPathFor, parseOpsLog, rotatedOpsLogPath, serializeOp, type ModelOpEntry } from './ops-log';

// --- fixtures ---------------------------------------------------------------------------------

/** A closed UV sphere: poles plus `rings - 1` latitude rows of `segments` vertices. */
function uvSphere(radius: number, segments: number, rings: number): { positions: Float32Array; indices: Uint32Array } {
  const pos: number[] = [0, radius, 0];
  for (let r = 1; r < rings; r += 1) {
    const phi = (Math.PI * r) / rings;
    for (let s = 0; s < segments; s += 1) {
      const theta = (2 * Math.PI * s) / segments;
      pos.push(radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
    }
  }
  pos.push(0, -radius, 0);
  const south = pos.length / 3 - 1;
  const row = (r: number, s: number): number => 1 + (r - 1) * segments + (s % segments);
  const idx: number[] = [];
  for (let s = 0; s < segments; s += 1) idx.push(0, row(1, s + 1), row(1, s));
  for (let r = 1; r < rings - 1; r += 1) {
    for (let s = 0; s < segments; s += 1) {
      idx.push(row(r, s), row(r, s + 1), row(r + 1, s));
      idx.push(row(r, s + 1), row(r + 1, s + 1), row(r + 1, s));
    }
  }
  for (let s = 0; s < segments; s += 1) idx.push(south, row(rings - 1, s), row(rings - 1, s + 1));
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}

/** An open `n × n` grid of quads in the XZ plane. */
function grid(n: number): { positions: Float32Array; indices: Uint32Array } {
  const pos: number[] = [];
  for (let z = 0; z <= n; z += 1) for (let x = 0; x <= n; x += 1) pos.push(x, 0, z);
  const at = (x: number, z: number): number => z * (n + 1) + x;
  const idx: number[] = [];
  for (let z = 0; z < n; z += 1) {
    for (let x = 0; x < n; x += 1) idx.push(at(x, z), at(x, z + 1), at(x + 1, z), at(x + 1, z), at(x, z + 1), at(x + 1, z + 1));
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}

/** Deterministic pseudo-random numbers in [0, 1). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// --- EditableMesh -------------------------------------------------------------------------------

describe('EditableMesh adjacency', () => {
  it('is closed for a sphere and every vertex is used', () => {
    const mesh = new EditableMesh(uvSphere(1, 12, 8));
    expect(mesh.isClosed()).toBe(true);
    for (let v = 0; v < mesh.vertexCount; v += 1) expect(mesh.facesOf(v).length).toBeGreaterThan(0);
    // The north pole touches one fan of `segments` triangles and has `segments` neighbours.
    expect(mesh.facesOf(0).length).toBe(12);
    expect(mesh.neighbours(0).sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });

  it('matches a brute-force face scan on an open grid, and reports its border', () => {
    const { positions, indices } = grid(4);
    const mesh = new EditableMesh({ positions, indices });
    for (let v = 0; v < mesh.vertexCount; v += 1) {
      const brute: number[] = [];
      for (let f = 0; f < indices.length / 3; f += 1) if ([0, 1, 2].some((k) => indices[f * 3 + k] === v)) brute.push(f);
      expect(Array.from(mesh.facesOf(v))).toEqual(brute);
    }
    expect(mesh.isClosed()).toBe(false);
    // A 4×4 grid has 16 border edges.
    expect(mesh.boundaryEdges()).toHaveLength(16);
    // A corner of the grid touches one or two triangles; an interior vertex six.
    expect(mesh.facesOf(0).length).toBe(1);
    expect(mesh.facesOf(6).length).toBe(6);
  });

  it('refuses an index past the end of positions', () => {
    expect(() => new EditableMesh({ positions: new Float32Array(9), indices: new Uint32Array([0, 1, 3]) })).toThrow(/only 3/);
  });

  it('recomputes normals only around dirty vertices, and they match a full recompute', () => {
    const mesh = new EditableMesh(uvSphere(1, 16, 10));
    const v = 40;
    const before = mesh.normals.slice();
    mesh.setPosition(v, mesh.positions[v * 3]! * 1.3, mesh.positions[v * 3 + 1]! * 1.3, mesh.positions[v * 3 + 2]! * 1.3);
    const changed = mesh.updateNormals();
    const ring = new Set([v, ...mesh.neighbours(v)]);
    expect(new Set(changed)).toEqual(ring);
    for (let u = 0; u < mesh.vertexCount; u += 1) {
      if (ring.has(u)) continue;
      expect(Array.from(mesh.normals.subarray(u * 3, u * 3 + 3))).toEqual(Array.from(before.subarray(u * 3, u * 3 + 3)));
    }
    const full = new EditableMesh({ positions: mesh.positions.slice(), indices: mesh.indices });
    for (let i = 0; i < mesh.normals.length; i += 1) expect(mesh.normals[i]).toBeCloseTo(full.normals[i]!, 5);
  });

  it('hands out one delta spanning the changed range, which applies onto a copy', () => {
    const source = uvSphere(1, 12, 8);
    const worker = new EditableMesh({ positions: source.positions.slice(), indices: source.indices });
    const display = new EditableMesh({ positions: source.positions.slice(), indices: source.indices });
    worker.setPosition(20, 0, 2, 0);
    const delta = worker.takeDelta()!;
    const ring = [20, ...worker.neighbours(20)];
    expect(delta.start).toBe(Math.min(...ring));
    expect(delta.end).toBe(Math.max(...ring) + 1);
    expect(delta.positions.length).toBe((delta.end - delta.start) * 3);
    display.applyDelta(delta);
    expect(Array.from(display.positions)).toEqual(Array.from(worker.positions));
    expect(Array.from(display.normals)).toEqual(Array.from(worker.normals));
    expect(worker.takeDelta()).toBeNull();
  });
});

// --- BVH ----------------------------------------------------------------------------------------

describe('Bvh', () => {
  const bruteRay = (positions: Float32Array, indices: Uint32Array, origin: [number, number, number], dir: [number, number, number]) => {
    let best: ReturnType<typeof intersectTriangle> = null;
    for (let t = 0; t < indices.length / 3; t += 1) {
      const hit = intersectTriangle(positions, indices, t, origin, dir);
      if (hit && (!best || hit.distance < best.distance)) best = hit;
    }
    return best;
  };

  const randomRay = (rand: () => number): { origin: [number, number, number]; dir: [number, number, number] } => {
    const origin: [number, number, number] = [rand() * 6 - 3, rand() * 6 - 3, rand() * 6 - 3];
    const target = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
    const d = [target[0]! - origin[0], target[1]! - origin[1], target[2]! - origin[2]];
    const len = Math.hypot(d[0]!, d[1]!, d[2]!);
    return { origin, dir: [d[0]! / len, d[1]! / len, d[2]! / len] };
  };

  it('ray hits match brute force', () => {
    const { positions, indices } = uvSphere(1, 24, 16);
    const bvh = new Bvh(positions, indices);
    const rand = rng(7);
    let hits = 0;
    for (let i = 0; i < 200; i += 1) {
      const { origin, dir } = randomRay(rand);
      const fast = bvh.raycast(origin, dir);
      const slow = bruteRay(positions, indices, origin, dir);
      if (!slow) expect(fast).toBeNull();
      else {
        hits += 1;
        expect(fast).not.toBeNull();
        expect(fast!.distance).toBeCloseTo(slow.distance, 6);
      }
    }
    expect(hits).toBeGreaterThan(50);
  });

  it('still matches brute force after vertices move and the tree is refitted', () => {
    const { positions, indices } = uvSphere(1, 24, 16);
    const bvh = new Bvh(positions, indices);
    // Inflate the upper half: boxes there must grow for the hits to be found.
    for (let v = 0; v < positions.length / 3; v += 1) if (positions[v * 3 + 1]! > 0) for (let k = 0; k < 3; k += 1) positions[v * 3 + k]! *= 1.6;
    bvh.refit();
    const rand = rng(11);
    for (let i = 0; i < 200; i += 1) {
      const { origin, dir } = randomRay(rand);
      const fast = bvh.raycast(origin, dir);
      const slow = bruteRay(positions, indices, origin, dir);
      expect(fast?.distance ?? null).toBe(slow?.distance ?? null);
    }
  });

  it('sphere queries return exactly the vertices within the radius', () => {
    const { positions, indices } = uvSphere(1, 32, 20);
    const bvh = new Bvh(positions, indices);
    const center: [number, number, number] = [0.6, 0.6, 0.2];
    const brute: number[] = [];
    for (let v = 0; v < positions.length / 3; v += 1) {
      if (Math.hypot(positions[v * 3]! - center[0], positions[v * 3 + 1]! - center[1], positions[v * 3 + 2]! - center[2]) <= 0.4) brute.push(v);
    }
    expect(brute.length).toBeGreaterThan(5);
    expect(bvh.verticesInSphere(center, 0.4)).toEqual(brute);
  });

  it('handles an empty mesh', () => {
    const bvh = new Bvh(new Float32Array(), new Uint32Array());
    expect(bvh.raycast([0, 0, 0], [0, 0, 1])).toBeNull();
    expect(bvh.verticesInSphere([0, 0, 0], 1)).toEqual([]);
  });
});

// --- binary storage -----------------------------------------------------------------------------

describe('mesh.bin', () => {
  const sample = () => {
    const mesh = new EditableMesh(uvSphere(1, 10, 6));
    return { positions: mesh.positions, normals: mesh.normals, indices: mesh.indices, multiresLevel: 2 };
  };

  it('round-trips byte for byte', () => {
    const bytes = encodeMeshBin(sample());
    const decoded = decodeMeshBin(bytes);
    expect(decoded.multiresLevel).toBe(2);
    expect(Array.from(decoded.indices)).toEqual(Array.from(sample().indices));
    const again = encodeMeshBin(decoded);
    expect(again).toEqual(bytes);
    expect(modelAssetHash(again)).toBe(modelAssetHash(bytes));
    expect(readMeshBinHeader(bytes)).toMatchObject({ version: 1, vertices: decoded.positions.length / 3, triangles: decoded.indices.length / 3 });
  });

  it('decodes from a view into a larger buffer', () => {
    const bytes = encodeMeshBin(sample());
    const padded = new Uint8Array(bytes.length + 5);
    padded.set(bytes, 3);
    expect(encodeMeshBin(decodeMeshBin(padded.subarray(3, 3 + bytes.length)))).toEqual(bytes);
  });

  it('refuses corrupt, truncated, foreign and wrong-version files with readable errors', () => {
    const bytes = encodeMeshBin(sample());
    const flipped = bytes.slice();
    flipped[MESH_BIN_HEADER_BYTES + 10] = flipped[MESH_BIN_HEADER_BYTES + 10]! ^ 0xff;
    expect(() => decodeMeshBin(flipped)).toThrow(/checksum/);
    expect(() => decodeMeshBin(bytes.subarray(0, bytes.length - 4))).toThrow(/truncated/);
    expect(() => decodeMeshBin(new TextEncoder().encode('{"not":"a mesh","pad":"..........................."}'))).toThrow(/not a sculpt mesh/);
    expect(() => decodeMeshBin(new Uint8Array(4))).toThrow(MeshBinError);
    const old = bytes.slice();
    new DataView(old.buffer).setUint16(8, 0, true);
    expect(() => decodeMeshBin(old)).toThrow(/older than this build/);
    const newer = bytes.slice();
    new DataView(newer.buffer).setUint16(8, 9, true);
    expect(() => decodeMeshBin(newer)).toThrow(/newer Midnite Studio/);
  });

  it('names files after the design stem', () => {
    expect(sculptMeshSrcFor('head')).toBe('head.mesh.bin');
    expect(sculptMeshSrcFor('head', 'p3')).toBe('head.p3.mesh.bin');
    expect(opsLogPathFor('head.mesh.bin')).toBe('head.ops.jsonl');
    expect(rotatedOpsLogPath('head.ops.jsonl')).toBe('head.ops.1.jsonl');
  });
});

// --- op log -------------------------------------------------------------------------------------

describe('op log', () => {
  const op = (n: number): ModelOpEntry => ({ kind: 'stroke', at: `2026-10-06T00:00:${String(n % 60).padStart(2, '0')}Z`, by: 'agent', data: { brush: 'draw', n } });

  it('appends, parses back and skips unreadable lines', () => {
    const { text, rotated } = appendOps('', [op(1), op(2)]);
    expect(rotated).toBeNull();
    const parsed = parseOpsLog(text + 'garbage\n{"kind":"nope","at":"x"}\n');
    expect(parsed.entries.map((e) => e.data?.n)).toEqual([1, 2]);
    expect(parsed.skipped).toBe(2);
  });

  it('rotates once the cap would be passed', () => {
    let text = '';
    for (let i = 0; i < 5; i += 1) text = appendOps(text, [op(i)], 5).text;
    const next = appendOps(text, [op(5)], 5);
    expect(next.rotated).toBe(text);
    expect(parseOpsLog(next.text).entries.map((e) => e.data?.n)).toEqual([5]);
  });

  it('refuses invalid or oversized entries', () => {
    expect(() => serializeOp({ kind: 'bogus' as never, at: 'x' })).toThrow();
    expect(() => serializeOp({ kind: 'stroke', at: 'x', data: { points: 'x'.repeat(20_000) } })).toThrow(/summarise/);
  });
});

// --- the sculpt part ----------------------------------------------------------------------------

describe('sculpt part', () => {
  afterEach(() => clearModelAssets());

  const bytes = encodeMeshBin({ ...(() => {
    const mesh = new EditableMesh(uvSphere(0.5, 12, 8));
    return { positions: mesh.positions, normals: mesh.normals, indices: mesh.indices };
  })(), multiresLevel: 0 });
  const hash = modelAssetHash(bytes);
  const spec = ModelSpecSchema.parse({
    name: 'Head',
    parts: [
      { name: 'head', shape: 'sculpt', src: 'head.mesh.bin', hash, vertices: 86, triangles: 168, position: [0, 1, 0] },
      { name: 'hat', shape: 'box', size: [1, 0.2, 1] },
    ],
  });

  it('parses, and rejects a path that leaves the folder', () => {
    expect(spec.parts[0]!.shape).toBe('sculpt');
    expect(ModelSpecSchema.safeParse({ parts: [{ shape: 'sculpt', src: '../x.mesh.bin', hash }] }).success).toBe(false);
    expect(ModelSpecSchema.safeParse({ parts: [{ shape: 'sculpt', src: 'x.glb', hash }] }).success).toBe(false);
  });

  it('old sidecars without sculpt parts still parse unchanged', () => {
    const legacy = { version: 1, name: 'crate', prompt: 'a crate', engine: 'ollama:x', createdAt: '2026-01-01', spec: { name: 'Crate', parts: [{ name: 'body', shape: 'box', size: [1, 1, 1] }] } };
    const parsed = ModelSidecarSchema.parse(legacy);
    expect(parsed.spec.parts).toHaveLength(1);
    expect(modelSculptSummary(parsed.spec)).toBeNull();
  });

  it('is reported missing until registered, then builds in world space as an imported mesh', () => {
    expect(missingSculptMeshes(spec).map((p) => p.src)).toEqual(['head.mesh.bin']);
    const before = buildSceneChecked(spec);
    expect(before.issues.some((i) => /Sculpt mesh "head.mesh.bin" is not loaded/.test(i.message))).toBe(true);
    registerSculptMesh(hash, bytes);
    expect(missingSculptMeshes(spec)).toEqual([]);
    const built = buildSceneChecked(spec);
    const head = built.parts.find((p) => p.name === 'head')!;
    expect(head.imported).toBe(true);
    expect(head.positions.length / 3).toBe(86);
    // Translated up by 1: the sphere of radius 0.5 now spans y ∈ [0.5, 1.5].
    const ys = head.positions.filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBeCloseTo(0.5, 5);
    expect(Math.max(...ys)).toBeCloseTo(1.5, 5);
  });

  it('cannot take part in a boolean', () => {
    const withCut = ModelSpecSchema.parse({ parts: [spec.parts[0], { name: 'cut', shape: 'box', size: [1, 1, 1], op: 'subtract', target: 'head' }] });
    expect(semanticIssues(withCut).some((i) => /sculpt mesh — booleans cannot cut it/.test(i.message))).toBe(true);
  });

  it('is summarised in model.json', () => {
    const manifest = buildModelManifest({
      sidecar: { version: 1, name: 'head', prompt: '', engine: 'mcp', spec, createdAt: '2026-10-06T00:00:00Z' },
      stem: 'head',
      author: { name: 'Bilo' },
      now: new Date('2026-10-06T00:00:00Z'),
    });
    expect(manifest.sculpt).toEqual({ parts: 1, vertices: 86, faces: 168, multiresLevel: 0, hasTextures: false });
    expect(manifest.files.mesh).toBe('head.mesh.bin');
  });
});
