import { decodeMeshBin, isClosed, parseModelSidecar, parseOpsLog, type ModelSpec } from '@midnite/studio-shared';
import type { Mesh, Object3D, SkinnedMesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it, vi } from 'vitest';

import { memoryModelKit } from './model-test-kit';

/** vitest: Phase 104 Theme F over the in-memory store — decimate, retopo, unwrap, bake, export, with a rig that must survive. */

vi.setConfig({ testTimeout: 120_000 });

type Kit = ReturnType<typeof memoryModelKit>;
const target = (kit: Kit, model: string) => ({ repoPath: kit.repoPath, project: 'gen', model });
const HEAD = { blend: 0.05, nodes: [{ kind: 'sphere', name: 'cranium', radius: 0.35, position: [0, 0.4, 0] }, { kind: 'capsule', name: 'neck', radius: 0.1, height: 0.3, position: [0, 0, 0] }] };
const ab = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

async function rigged(kit: Kit): Promise<string> {
  const made = await kit.tools.model_set_spec({ ...target(kit, 'bust'), spec: { name: 'bust', parts: [{ name: 'plinth', shape: 'box', size: [0.6, 0.05, 0.6], position: [0, -0.4, 0] }] } });
  if (!made.ok) throw new Error(JSON.stringify(made.errors));
  const sdf = await kit.tools.model_sdf_set({ ...target(kit, made.model), tree: HEAD, name: 'head', resolution: 56 });
  if (!sdf.ok) throw new Error(JSON.stringify(sdf.errors));
  const rig = await kit.tools.model_auto_rig({ ...target(kit, made.model), anatomy: 'biped' });
  if (!rig.ok) throw new Error(JSON.stringify(rig.errors));
  await kit.tools.model_patch_animations({ ...target(kit, made.model), ops: [{ op: 'add', clip: { name: 'idle', kind: 'idle' } }] });
  return made.model;
}

const spec = (kit: Kit, model: string): ModelSpec => parseModelSidecar(kit.files.get(`gen/${model.replace(/\.obj$/, '.json')}`)!.toString('utf8'))!.spec;
const sculpts = (kit: Kit, model: string) => spec(kit, model).parts.filter((p): p is Extract<typeof p, { shape: 'sculpt' }> => p.shape === 'sculpt');
const meshOf = (kit: Kit, model: string, name: string) => {
  const part = sculpts(kit, model).find((p) => p.name === name)!;
  return decodeMeshBin(new Uint8Array(kit.files.get(`gen/${model.split('/')[0]}/${part.src}`)!));
};

describe('model_decimate and model_retopo', () => {
  it('make a low-poly copy, hide the original as the bake source, keep the mesh closed and the rig skinning', async () => {
    const kit = memoryModelKit();
    const model = await rigged(kit);
    const high = sculpts(kit, model)[0]!;
    const out = await kit.tools.model_decimate({ ...target(kit, model), targetTriangles: Math.round(high.triangles! / 4), name: 'head low' });
    if (!out.ok) throw new Error(JSON.stringify(out.errors));
    expect(out.pipeline).toMatchObject({ op: 'decimate', summary: { reachedTarget: true } });
    expect(out.pipeline!.triangles).toBeLessThanOrEqual(Math.round(high.triangles! / 4));
    expect(out.pipeline!.rig).toMatchObject({ kept: true, normalised: true });
    expect(out.pipeline!.rig!.drift.mean).toBeLessThan(0.5);

    const parts = sculpts(kit, model);
    expect(parts.map((p) => [p.name, p.hidden === true])).toEqual([['head', true], ['head low', false]]);
    expect(parts[1]!.bakeFrom).toBe(high.id);
    const low = meshOf(kit, model, 'head low');
    expect(isClosed({ positions: Array.from(low.positions), indices: Array.from(low.indices) })).toBe(true);
    expect(spec(kit, model).anatomy).toBe('biped');
    expect(spec(kit, model).animations?.map((c) => c.name)).toEqual(['idle']);
  });

  it('retopologises to a quad-dominant mesh near the face target', async () => {
    const kit = memoryModelKit();
    const model = await rigged(kit);
    const out = await kit.tools.model_retopo({ ...target(kit, model), targetFaces: 1500 });
    if (!out.ok) throw new Error(JSON.stringify(out.errors));
    expect(out.pipeline!.triangles).toBeGreaterThan(1500 * 0.75);
    expect(out.pipeline!.triangles).toBeLessThan(1500 * 1.3);
    expect(out.pipeline!.summary.quadShare as number).toBeGreaterThan(0.7);
    expect(out.pipeline!.rig).toMatchObject({ kept: true, normalised: true });
  });
});

describe('model_unwrap, model_bake, model_export', () => {
  it('unwraps, refuses sculpting while unwrapped, welds back on clear, bakes four maps and exports a glb with them', async () => {
    const kit = memoryModelKit();
    const model = await rigged(kit);
    const t = target(kit, model);
    const dec = await kit.tools.model_decimate({ ...t, targetTriangles: 1200, name: 'head low' });
    if (!dec.ok) throw new Error(JSON.stringify(dec.errors));
    const lowId = dec.pipeline!.part;

    const before = meshOf(kit, model, 'head low');
    const un = await kit.tools.model_unwrap({ ...t, part: lowId, textureSize: 1024 });
    if (!un.ok) throw new Error(JSON.stringify(un.errors));
    expect(un.pipeline!.summary.charts as number).toBeGreaterThan(1);
    expect(un.pipeline!.summary.texelsPerMetreMean as number).toBeGreaterThan(0);
    const unwrapped = meshOf(kit, model, 'head low');
    expect(unwrapped.uvs).toHaveLength((unwrapped.positions.length / 3) * 2);
    for (const uv of unwrapped.uvs!) {
      expect(uv).toBeGreaterThanOrEqual(-1e-6);
      expect(uv).toBeLessThanOrEqual(1 + 1e-6);
    }
    expect(sculpts(kit, model)[1]!.uv).toMatchObject({ textureSize: 1024 });

    expect(await kit.tools.model_subdivide({ ...t, part: lowId })).toMatchObject({ ok: false, errors: [{ message: expect.stringContaining('model_unwrap') }] });
    expect(await kit.tools.model_bake({ ...t, part: lowId, from: lowId })).toMatchObject({ ok: false, errors: [{ path: 'from' }] });

    const baked = await kit.tools.model_bake({ ...t, part: lowId, size: 128, aoSamples: 4 });
    if (!baked.ok) throw new Error(JSON.stringify(baked.errors));
    expect(baked.pipeline!.summary.hitRate as number).toBeGreaterThan(0.5);
    const maps = sculpts(kit, model)[1]!.maps!;
    expect(Object.keys(maps).sort()).toEqual(['ao', 'cavity', 'curvature', 'normal']);
    for (const file of Object.values(maps)) {
      const png = kit.files.get(`gen/${model.split('/')[0]}/${file.src}`)!;
      expect(png.subarray(1, 4).toString()).toBe('PNG');
    }

    const exported = await kit.tools.model_export({ ...t, formats: ['glb', 'obj'] });
    if (!exported.ok) throw new Error(JSON.stringify(exported.errors));
    expect(exported.pipeline!.summary.files).toEqual(expect.arrayContaining([expect.stringMatching(/\.glb$/), expect.stringMatching(/\.obj$/), expect.stringMatching(/\.mtl$/)]));
    expect(exported.pipeline!.summary.files).not.toContainEqual(expect.stringMatching(/\.fbx$/));

    const glb = kit.files.get(`gen/${model.replace(/\.obj$/, '.glb')}`)!;
    vi.stubGlobal('self', globalThis);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const gltf = await new GLTFLoader().parseAsync(ab(glb), '');
    error.mockRestore();
    vi.unstubAllGlobals();
    const skinned: SkinnedMesh[] = [];
    gltf.scene.traverse((o: Object3D) => (o as SkinnedMesh).isSkinnedMesh && skinned.push(o as SkinnedMesh));
    const lowMesh = skinned.find((m) => m.geometry.getAttribute('uv'));
    expect(lowMesh).toBeDefined();
    expect(gltf.animations.map((a) => a.name)).toEqual(['idle']);
    const json = gltf.parser.json as { materials: { normalTexture?: unknown; occlusionTexture?: unknown }[]; images: unknown[] };
    expect(json.materials.some((m) => m.normalTexture && m.occlusionTexture)).toBe(true);
    expect(json.images).toHaveLength(2);
    // Hidden high-poly part is not exported.
    const meshes: Mesh[] = [];
    gltf.scene.traverse((o: Object3D) => (o as Mesh).isMesh && meshes.push(o as Mesh));
    expect(meshes.filter((m) => m.name.startsWith('head')).length).toBe(1);

    const obj = kit.files.get(`gen/${model}`)!.toString('utf8');
    expect(obj).toMatch(/^vt /m);
    expect(kit.files.get(`gen/${model.replace(/\.obj$/, '.mtl')}`)!.toString('utf8')).toMatch(/map_Bump .*\.png/);

    const cleared = await kit.tools.model_unwrap({ ...t, part: lowId, clear: true });
    if (!cleared.ok) throw new Error(JSON.stringify(cleared.errors));
    const welded = meshOf(kit, model, 'head low');
    expect(welded.uvs).toBeUndefined();
    expect(welded.positions.length).toBe(before.positions.length);
    expect(sculpts(kit, model)[1]!.uv).toBeUndefined();
    expect(sculpts(kit, model)[1]!.maps).toBeUndefined();
    const ops = parseOpsLog(kit.files.get(`gen/${model.split('/')[0]}/${sculpts(kit, model)[1]!.src.replace('.mesh.bin', '.ops.jsonl')}`)!.toString('utf8'));
    expect(ops.entries.some((e) => e.kind === 'decimate')).toBe(true);
  });
});
