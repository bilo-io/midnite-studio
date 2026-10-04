import {
  buildScene,
  buildSceneChecked,
  clearModelAssets,
  computeSkin,
  MAX_INFLUENCES,
  ModelGenerateRequestSchema,
  ModelManifestSchema,
  ModelSpecSchema,
  modelAssetHash,
  parseGlbMesh,
  parseModelSidecar,
  RIG_EXAMPLE_BIPED,
  resolveRig,
  samplePose,
  skinMatrices,
  skinParts,
  validateRig,
  type ModelSpec,
} from '@midnite/studio-shared';
import type { Bone, Mesh, Object3D, SkinnedMesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { figureGlb } from './asset-fixture';
import { renderModel } from './model-service';
import { memoryModelKit } from './model-test-kit';

/**
 * Phase 103 Theme J: an SF3D result as a first-class `asset` part. Everything runs on a synthetic
 * textured `.glb` (`asset-fixture.ts`) — no SF3D weights, no inference output.
 */

const fixture = figureGlb();
const STEM = 'figure-20261004-120000';
const ab = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const all = <T extends Object3D>(root: Object3D, test: (o: Object3D) => boolean): T[] => {
  const out: T[] = [];
  root.traverse((o) => test(o) && out.push(o as T));
  return out;
};

async function imported() {
  const kit = memoryModelKit();
  const result = await kit.service.importAsset({
    repoId: 'r1',
    project: 'props',
    stem: STEM,
    name: 'figure',
    prompt: 'Image to 3D: figure.png',
    engine: 'sf3d',
    glb: fixture.glb,
    reference: { file: `${STEM}.ref.png`, data: Buffer.from('png') },
    extra: { sf3d: { revision: 'abc', textureSize: 1024 } },
  });
  if (!result.ok) throw new Error('import failed');
  const target = { repoPath: kit.repoPath, project: 'props', model: result.value.primary };
  return { kit, result: result.value, target };
}

const sidecarOf = (kit: ReturnType<typeof memoryModelKit>) => parseModelSidecar(kit.files.get(`props/${STEM}/${STEM}.json`)!.toString('utf8'))!;

beforeEach(() => clearModelAssets());

describe('an SF3D-style mesh imported as an asset part', () => {
  it('writes the mesh, a design with one asset part, its exports and a model.json naming sf3d', async () => {
    const { kit, result } = await imported();
    expect(result.primary).toBe(`${STEM}/${STEM}.obj`);
    for (const name of ['asset.glb', 'ref.png', 'json', 'obj', 'mtl', 'fbx', 'glb']) expect(kit.files.has(`props/${STEM}/${STEM}.${name}`)).toBe(true);
    expect(kit.files.get(`props/${STEM}/${STEM}.asset.glb`)!.equals(fixture.glb)).toBe(true);

    const part = result.spec.parts[0]!;
    expect(part).toMatchObject({ shape: 'asset', src: `${STEM}.asset.glb`, hash: modelAssetHash(new Uint8Array(fixture.glb)), triangles: fixture.triangles });
    // Stood on the ground: the lowest vertex sits at y = 0.
    const built = buildScene(result.spec);
    expect(built).toHaveLength(1);
    expect(Math.min(...built[0]!.positions.filter((_, i) => i % 3 === 1))).toBeCloseTo(0, 3);
    expect(built[0]).toMatchObject({ imported: true, texture: part.shape === 'asset' ? part.hash : '' });
    expect(built[0]!.uvs).toHaveLength((built[0]!.positions.length / 3) * 2);

    const manifest = ModelManifestSchema.parse(JSON.parse(kit.files.get(`props/${STEM}/model.json`)!.toString('utf8')));
    expect(manifest).toMatchObject({ agent: { provider: 'sf3d', model: 'stabilityai/stable-fast-3d' }, files: { design: `${STEM}.json`, obj: `${STEM}.obj`, asset: `${STEM}.asset.glb` }, details: { parts: 1, polygons: fixture.triangles } });
    expect((manifest as Record<string, unknown>).sf3d).toEqual({ revision: 'abc', textureSize: 1024 });
  });

  it('round-trips through the sidecar, and rebuilds from the file once the registry is empty', async () => {
    const { kit, target } = await imported();
    const sidecar = sidecarOf(kit);
    expect(parseModelSidecar(JSON.stringify(sidecar))).toEqual(sidecar);
    expect(sidecar.engine).toBe('sf3d');

    clearModelAssets();
    expect(buildSceneChecked(sidecar.spec).issues[0]!.message).toMatch(/not loaded/);
    // Any model_* tool loads the file beside the design before it builds.
    const spec = (await kit.tools.model_get_spec(target)) as { spec: { parts: { shape: string }[] } };
    expect(spec.spec.parts[0]!.shape).toBe('asset');
    expect(buildSceneChecked(sidecar.spec).issues).toEqual([]);
  });

  it('reports a changed file instead of drawing the wrong mesh', async () => {
    const { kit, target } = await imported();
    clearModelAssets();
    kit.files.set(`props/${STEM}/${STEM}.asset.glb`, Buffer.concat([fixture.glb, Buffer.from([0])]));
    await kit.tools.model_get_spec(target);
    expect(buildSceneChecked(sidecarOf(kit).spec).issues[0]!.message).toMatch(/not loaded/);
  });

  it('auto-rigs as a biped through model_auto_rig, with a skeleton fitted to the mesh', async () => {
    const { kit, target } = await imported();
    const out = await kit.tools.model_auto_rig({ ...target, anatomy: 'biped' });
    expect(out).toMatchObject({ ok: true });
    const spec = sidecarOf(kit).spec;
    expect(validateRig(spec)).toEqual([]);
    const rig = resolveRig(spec)!;
    const head = (name: string) => rig.bones[rig.byName.get(name)!]!.head;
    const tail = (name: string) => rig.bones[rig.byName.get(name)!]!.tail;
    // The figure: crotch ~0.74, neck ~1.5, arms out to x ≈ ±0.48, 1.8 tall.
    expect(head('hips')[1]).toBeGreaterThan(0.65);
    expect(head('hips')[1]).toBeLessThan(0.95);
    expect(head('head')[1]).toBeGreaterThan(1.4);
    expect(tail('leftHand')[0]).toBeGreaterThan(0.3);
    expect(tail('rightHand')[0]).toBeLessThan(-0.3);
    expect(head('leftUpperLeg')[0]).toBeGreaterThan(0.04);
    expect(head('leftFoot')[1]).toBeLessThan(0.2);
  });

  it('weights every vertex per bone segment: normalised, at most four influences, limbs on their own bones', async () => {
    const { kit, target } = await imported();
    await kit.tools.model_auto_rig({ ...target, anatomy: 'biped' });
    const spec = sidecarOf(kit).spec;
    const rig = resolveRig(spec)!;
    const parts = buildScene(spec);
    const [skin] = computeSkin(spec, rig, parts);
    const count = parts[0]!.positions.length / 3;
    expect(skin!.weights).toHaveLength(count * MAX_INFLUENCES);
    const used = new Set<number>();
    for (let v = 0; v < count; v += 1) {
      const w = skin!.weights.slice(v * MAX_INFLUENCES, (v + 1) * MAX_INFLUENCES);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
      expect(w.filter((x) => x > 0).length).toBeLessThanOrEqual(MAX_INFLUENCES);
      used.add(skin!.joints[v * MAX_INFLUENCES]!);
    }
    expect(used.size).toBeGreaterThan(12);
    expect(used.has(rig.byName.get('root')!)).toBe(false);
    // A vertex at the left ankle follows the left leg chain; one on top of the head follows the head.
    const p = parts[0]!.positions;
    const nearest = (x: number, y: number, z: number) => {
      let best = 0;
      for (let v = 1; v < count; v += 1) if (Math.hypot(p[v * 3]! - x, p[v * 3 + 1]! - y, p[v * 3 + 2]! - z) < Math.hypot(p[best * 3]! - x, p[best * 3 + 1]! - y, p[best * 3 + 2]! - z)) best = v;
      return best;
    };
    const boneOf = (v: number) => rig.bones[skin!.joints[v * MAX_INFLUENCES]!]!.name;
    expect(boneOf(nearest(0.12, 0.12, 0))).toMatch(/^left(LowerLeg|Foot)$/);
    expect(boneOf(nearest(0, 1.79, 0))).toBe('head');
  });

  it('poses: a walk clip moves the vertices, the rest pose does not', async () => {
    const { kit, target } = await imported();
    await kit.tools.model_auto_rig({ ...target, anatomy: 'biped' });
    await kit.tools.model_patch_animations({ ...target, ops: [{ op: 'add', clip: { name: 'walk', kind: 'walk' } }] });
    const spec = sidecarOf(kit).spec;
    const rig = resolveRig(spec)!;
    const parts = buildScene(spec);
    const skins = computeSkin(spec, rig, parts);
    const rest = skinParts(parts, skins, skinMatrices(rig, samplePose(rig, { name: 'still', kind: 'custom' }, 0)));
    const walked = skinParts(parts, skins, skinMatrices(rig, samplePose(rig, spec.animations![0]!, 0.25)));
    const moved = (a: number[], b: number[]) => a.reduce((most, x, i) => Math.max(most, Math.abs(x - b[i]!)), 0);
    expect(moved(rest[0]!.positions, parts[0]!.positions)).toBeLessThan(1e-6);
    expect(moved(walked[0]!.positions, parts[0]!.positions)).toBeGreaterThan(0.02);
  });

  it('exports a skinned, animated, textured .glb that GLTFLoader reads back', async () => {
    const { kit, target } = await imported();
    await kit.tools.model_auto_rig({ ...target, anatomy: 'biped' });
    await kit.tools.model_patch_animations({ ...target, ops: [{ op: 'add', clip: { name: 'idle', kind: 'idle' } }, { op: 'add', clip: { name: 'walk', kind: 'walk' } }] });
    const spec = sidecarOf(kit).spec;
    const glb = renderModel(spec, 'glb', STEM);

    // The image bytes ride along untouched, with the uvs.
    const reread = parseGlbMesh(new Uint8Array(glb));
    expect(reread.texture?.mime).toBe('image/png');
    expect(Buffer.from(reread.texture!.data).equals(fixture.png)).toBe(true);
    expect(reread.uvs).not.toBeNull();

    // Node has no image decoder: the loader logs that it could not decode the PNG and carries on, which
    // is all this needs — the texture's presence is read from the parsed document and the bytes above.
    vi.stubGlobal('self', globalThis);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const gltf = await new GLTFLoader().parseAsync(ab(glb), '');
    error.mockRestore();
    vi.unstubAllGlobals();
    const skinned = all<SkinnedMesh>(gltf.scene, (o) => (o as SkinnedMesh).isSkinnedMesh === true);
    expect(skinned).toHaveLength(1);
    expect(skinned[0]!.geometry.getAttribute('uv')).toBeDefined();
    expect(skinned[0]!.geometry.getAttribute('skinWeight').count).toBe(skinned[0]!.geometry.getAttribute('position').count);
    const bones = all<Bone>(gltf.scene, (o) => (o as Bone).isBone === true).map((b) => b.name);
    expect(bones).toEqual(expect.arrayContaining(['root', 'hips', 'head', 'leftUpperLeg', 'rightHand']));
    expect(gltf.animations.map((a) => a.name)).toEqual(['idle', 'walk']);
    const json = gltf.parser.json as { materials: { pbrMetallicRoughness: { baseColorTexture?: { index: number } } }[]; images: { mimeType: string }[] };
    const mesh = all<Mesh>(gltf.scene, (o) => (o as Mesh).isMesh === true)[0]!;
    const materialIndex = gltf.parser.associations.get(mesh.material as never)?.materials;
    expect(json.materials[materialIndex ?? 0]!.pbrMetallicRoughness.baseColorTexture).toEqual({ index: 0 });
    expect(json.images[0]!.mimeType).toBe('image/png');
    // obj/fbx export as before (geometry only).
    expect(renderModel(spec, 'obj', STEM).toString('utf8')).toMatch(/^v /m);
    expect(renderModel(spec, 'fbx', STEM).length).toBeGreaterThan(1000);
  });
});

describe('SF3D behind the Models engine seam', () => {
  const image = { name: 'figure.png', mime: 'image/png' as const, data: Buffer.from('png').toString('base64') };

  it('needs a picture', () => {
    const base = { generationId: 'g', repoId: 'r1', project: 'props', engine: { kind: 'sf3d' as const } };
    expect(ModelGenerateRequestSchema.safeParse({ ...base, prompt: 'a figure' }).success).toBe(false);
    expect(ModelGenerateRequestSchema.safeParse({ ...base, image }).success).toBe(true);
  });

  it('routes an sf3d engine request to the SF3D service and answers its design', async () => {
    const generate = vi.fn(async () => ({ ok: true as const, value: { files: [`${STEM}/${STEM}.obj`], primary: `${STEM}/${STEM}.obj`, vertices: 3, triangles: 1 } }));
    const kit = memoryModelKit({ service: { sf3d: { generate, cancel: () => ({ ok: true, value: undefined }) } } });
    const result = await kit.service.generate(ModelGenerateRequestSchema.parse({ generationId: 'g', repoId: 'r1', project: 'props', engine: { kind: 'sf3d', textureSize: 512 }, image }));
    expect(result).toEqual({ ok: true, value: { files: [`${STEM}/${STEM}.obj`], primary: `${STEM}/${STEM}.obj` } });
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ generationId: 'g', project: 'props', image, textureSize: 512 }));
  });

  it('refuses an sf3d request in a build without the engine', async () => {
    const kit = memoryModelKit();
    const result = await kit.service.generate(ModelGenerateRequestSchema.parse({ generationId: 'g', repoId: 'r1', project: 'props', engine: { kind: 'sf3d' }, image }));
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/not available/) });
  });
});

describe('the asset part in the schema', () => {
  it('leaves old designs parsing exactly as before', () => {
    const old: ModelSpec = ModelSpecSchema.parse(RIG_EXAMPLE_BIPED);
    expect(ModelSpecSchema.parse(JSON.parse(JSON.stringify(old)))).toEqual(old);
    expect(ModelSpecSchema.parse({ parts: [{ shape: 'box', size: [1, 1, 1] }] }).parts[0]).toMatchObject({ shape: 'box', color: '#b0b0b0' });
  });

  it('keeps src inside the model folder and requires a hex hash', () => {
    const part = (src: string, hash = 'abcdef0123456789') => ModelSpecSchema.safeParse({ parts: [{ shape: 'asset', src, hash }] }).success;
    expect(part('fox.asset.glb')).toBe(true);
    expect(part('meshes/fox.glb')).toBe(true);
    expect(part('../fox.glb')).toBe(false);
    expect(part('/abs/fox.glb')).toBe(false);
    expect(part('fox.obj')).toBe(false);
    expect(part('fox.glb', 'NOT-HEX')).toBe(false);
  });
});
