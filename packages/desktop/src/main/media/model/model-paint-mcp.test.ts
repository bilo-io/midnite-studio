import { parseModelSidecar, parseOpsLog, type ModelSculptPart, type ModelSpec } from '@midnite/studio-shared';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it, vi } from 'vitest';

import { decodePng } from '../png/png-codec';
import { memoryModelKit } from './model-test-kit';

/** vitest: Phase 104 Theme G over the in-memory store — materials, layers and paint strokes on an unwrapped, baked sculpt. */

vi.setConfig({ testTimeout: 120_000 });

type Kit = ReturnType<typeof memoryModelKit>;
const target = (kit: Kit, model: string) => ({ repoPath: kit.repoPath, project: 'gen', model });
const HEAD = { blend: 0.05, nodes: [{ kind: 'sphere', name: 'cranium', radius: 0.35, position: [0, 0.4, 0] }, { kind: 'capsule', name: 'neck', radius: 0.1, height: 0.3, position: [0, 0, 0] }] };
const ab = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

const spec = (kit: Kit, model: string): ModelSpec => parseModelSidecar(kit.files.get(`gen/${model.replace(/\.obj$/, '.json')}`)!.toString('utf8'))!.spec;
const low = (kit: Kit, model: string): ModelSculptPart => spec(kit, model).parts.find((p): p is ModelSculptPart => p.shape === 'sculpt' && p.name === 'head low')!;
const file = (kit: Kit, model: string, src: string): Buffer => kit.files.get(`gen/${model.split('/')[0]}/${src}`)!;

/** A head, decimated, unwrapped and baked — what a painted asset starts from. */
async function baked(kit: Kit): Promise<{ model: string; lowId: string }> {
  const made = await kit.tools.model_set_spec({ ...target(kit, 'bust'), spec: { name: 'bust', parts: [{ name: 'plinth', shape: 'box', size: [0.6, 0.05, 0.6], position: [0, -0.4, 0] }] } });
  if (!made.ok) throw new Error(JSON.stringify(made.errors));
  const t = target(kit, made.model);
  const sdf = await kit.tools.model_sdf_set({ ...t, tree: HEAD, name: 'head', resolution: 48 });
  if (!sdf.ok) throw new Error(JSON.stringify(sdf.errors));
  const dec = await kit.tools.model_decimate({ ...t, targetTriangles: 800, name: 'head low' });
  if (!dec.ok) throw new Error(JSON.stringify(dec.errors));
  const lowId = dec.pipeline!.part;
  const un = await kit.tools.model_unwrap({ ...t, part: lowId, textureSize: 256 });
  if (!un.ok) throw new Error(JSON.stringify(un.errors));
  const bake = await kit.tools.model_bake({ ...t, part: lowId, size: 64, aoSamples: 3 });
  if (!bake.ok) throw new Error(JSON.stringify(bake.errors));
  return { model: made.model, lowId };
}

describe('model_material_set and model_layer_*', () => {
  it('applies a preset, flattens it, and exports a glb with the full PBR set', async () => {
    const kit = memoryModelKit();
    const { model, lowId } = await baked(kit);
    const t = target(kit, model);

    // The hidden high-poly part has no UVs: refused with a sentence.
    expect(await kit.tools.model_material_set({ ...t, part: 'head', preset: 'metal' })).toMatchObject({ ok: false, errors: [{ path: 'part', message: expect.stringContaining('model_unwrap') }] });

    const set = await kit.tools.model_material_set({ ...t, part: lowId, preset: 'painted_metal', size: 64 });
    if (!set.ok) throw new Error(JSON.stringify(set.errors));
    expect(set.material!.layers.map((l) => l.id)).toEqual(['paint', 'chips', 'dirt']);
    const part = low(kit, model);
    expect(part.color).toBe('#2f5d8a');
    expect(part.material).toMatchObject({ metalness: 0 });
    expect(Object.keys(part.pbr!.flattened!).sort()).toEqual(['baseColor', 'normal', 'orm']);
    const orm = decodePng(file(kit, model, part.pbr!.flattened!.orm!.src));
    expect(orm.ok && orm.image.width).toBe(64);

    const listed = await kit.tools.model_layer_list({ ...t, part: lowId });
    expect(listed).toMatchObject({ part: lowId, unwrapped: true, preset: 'painted_metal', sizes: { albedo: 64, normal: 64 } });
    expect(listed.bakes.sort()).toEqual(['ao', 'cavity', 'curvature', 'normal']);
    expect(listed.layers.find((l) => l.id === 'chips')).toMatchObject({ kind: 'fill', mask: 'curvature', channels: expect.arrayContaining(['albedo', 'metalness', 'roughness']) });

    const exported = await kit.tools.model_export({ ...t, formats: ['glb', 'obj'] });
    if (!exported.ok) throw new Error(JSON.stringify(exported.errors));
    const glb = kit.files.get(`gen/${model.replace(/\.obj$/, '.glb')}`)!;
    vi.stubGlobal('self', globalThis);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const gltf = await new GLTFLoader().parseAsync(ab(glb), '');
    error.mockRestore();
    vi.unstubAllGlobals();
    type Mat = {
      pbrMetallicRoughness: { baseColorFactor: number[]; baseColorTexture?: { index: number }; metallicRoughnessTexture?: { index: number }; metallicFactor: number; roughnessFactor: number };
      normalTexture?: { index: number };
      occlusionTexture?: { index: number };
    };
    const json = gltf.parser.json as { materials: Mat[]; images: unknown[] };
    const painted = json.materials.find((m) => m.pbrMetallicRoughness.metallicRoughnessTexture);
    expect(painted).toBeDefined();
    expect(painted!.pbrMetallicRoughness.baseColorTexture).toBeDefined();
    expect(painted!.pbrMetallicRoughness.baseColorFactor.slice(0, 3)).toEqual([1, 1, 1]);
    expect(painted!.pbrMetallicRoughness.metallicFactor).toBe(1);
    expect(painted!.pbrMetallicRoughness.roughnessFactor).toBe(1);
    // Occlusion is packed into the ORM image's red channel, so both point at the same texture.
    expect(painted!.occlusionTexture!.index).toBe(painted!.pbrMetallicRoughness.metallicRoughnessTexture!.index);
    expect(painted!.normalTexture).toBeDefined();
    expect(json.images).toHaveLength(3);
    expect(kit.files.get(`gen/${model.replace(/\.obj$/, '.mtl')}`)!.toString('utf8')).toMatch(/map_Kd .*pbr-baseColor.*\.png/);
  });

  it('adds, updates and removes layers, re-flattening each time', async () => {
    const kit = memoryModelKit();
    const { model, lowId } = await baked(kit);
    const t = target(kit, model);
    await kit.tools.model_material_set({ ...t, part: lowId, color: '#808080', roughness: 0.5, size: 64 });
    const first = low(kit, model).pbr!.flattened!.baseColor!;

    const added = await kit.tools.model_layer_add({ ...t, part: lowId, kind: 'fill', name: 'Dirt', fill: { albedo: '#201008' }, blend: 'multiply', mask: { source: 'cavity', invert: true, low: 0.4, high: 0.97 } });
    if (!added.ok) throw new Error(JSON.stringify(added.errors));
    expect(added.material!.layers).toEqual([expect.objectContaining({ id: 'dirt', blend: 'multiply', mask: 'inverted cavity' })]);
    expect(low(kit, model).pbr!.flattened!.baseColor!.hash).not.toBe(first.hash);

    const updated = await kit.tools.model_layer_update({ ...t, part: lowId, layer: 'Dirt', opacity: 0.25, hidden: true });
    if (!updated.ok) throw new Error(JSON.stringify(updated.errors));
    // Hidden: the flattened colour is the plain base again.
    expect(low(kit, model).pbr!.flattened!.baseColor!.hash).toBe(first.hash);
    expect(low(kit, model).pbr!.layers[0]).toMatchObject({ opacity: 0.25, hidden: true });

    expect(await kit.tools.model_layer_update({ ...t, part: lowId, layer: 'nope', opacity: 1 })).toMatchObject({ ok: false, errors: [{ path: 'layer' }] });
    expect(await kit.tools.model_layer_add({ ...t, part: lowId, kind: 'fill' })).toMatchObject({ ok: false, errors: [{ path: 'layer' }] });

    const removed = await kit.tools.model_layer_remove({ ...t, part: lowId, layer: 'dirt' });
    if (!removed.ok) throw new Error(JSON.stringify(removed.errors));
    expect(low(kit, model).pbr!.layers).toEqual([]);

    const cleared = await kit.tools.model_material_set({ ...t, part: lowId, clear: true });
    if (!cleared.ok) throw new Error(JSON.stringify(cleared.errors));
    expect(low(kit, model).pbr).toBeUndefined();
  });
});

describe('model_paint_stroke', () => {
  it('paints a new paint layer by a world point, writes its PNG and the flattened colour, and returns a thumbnail', async () => {
    const kit = memoryModelKit();
    const { model, lowId } = await baked(kit);
    const t = target(kit, model);
    await kit.tools.model_material_set({ ...t, part: lowId, color: '#808080', size: 64 });

    const out = await kit.tools.model_paint_stroke({ ...t, part: lowId, brush: 'brush', color: '#ff0000', radius: 0.2, target: { mode: 'world', points: [[0, 0.45, 0.4]] } });
    const blocks = (out as { _content: { type: string; text?: string }[] })._content;
    const result = JSON.parse(blocks[0]!.text!);
    expect(result).toMatchObject({ ok: true, material: { layers: [expect.objectContaining({ id: 'paint', kind: 'paint', channels: ['albedo'] })], summary: { brush: 'brush', channel: 'albedo' } } });
    expect(result.material.summary.texels).toBeGreaterThan(10);
    expect(blocks.some((b) => b.type === 'image')).toBe(true);

    const part = low(kit, model);
    const layerPng = decodePng(file(kit, model, part.pbr!.layers[0]!.maps!.albedo!.src));
    expect(layerPng.ok && layerPng.image.channels).toBe(4);
    const flat = decodePng(file(kit, model, part.pbr!.flattened!.baseColor!.src));
    if (!flat.ok) throw new Error(flat.message);
    let red = 0;
    for (let i = 0; i < flat.image.width * flat.image.height; i += 1) {
      const d = flat.image.data;
      if (d[i * 4]! > 200 && d[i * 4 + 1]! < 60) red += 1;
    }
    expect(red).toBeGreaterThan(5);
    const ops = parseOpsLog(file(kit, model, part.src.replace('.mesh.bin', '.ops.jsonl')).toString('utf8'));
    expect(ops.entries.some((e) => e.kind === 'paint')).toBe(true);

    // A second stroke on roughness lands in the same layer and only re-flattens the ORM image.
    const before = part.pbr!.flattened!.baseColor!.hash;
    await kit.tools.model_paint_stroke({ ...t, part: lowId, brush: 'brush', channel: 'roughness', value: 0.1, radius: 0.2, target: { mode: 'world', points: [[0, 0.45, 0.4]] }, preview: false });
    const after = low(kit, model);
    expect(Object.keys(after.pbr!.layers[0]!.maps!).sort()).toEqual(['albedo', 'roughness']);
    expect(after.pbr!.flattened!.baseColor!.hash).toBe(before);
  });

  it('aims by preview pixels, erases, and refuses a fill layer', async () => {
    const kit = memoryModelKit();
    const { model, lowId } = await baked(kit);
    const t = target(kit, model);
    await kit.tools.model_material_set({ ...t, part: lowId, size: 64 });
    await kit.tools.model_layer_add({ ...t, part: lowId, kind: 'fill', name: 'Base', fill: { albedo: '#3366aa' } });

    expect(await kit.tools.model_paint_stroke({ ...t, part: lowId, layer: 'base', brush: 'brush', target: { mode: 'world', points: [[0, 0.45, 0.4]] } })).toMatchObject({
      ok: false,
      errors: [{ path: 'layer', message: expect.stringContaining('fill layer') }],
    });

    const screen = await kit.tools.model_paint_stroke({ ...t, part: lowId, brush: 'brush', color: '#ffff00', target: { mode: 'screen', view: 'front', points: [[192, 130], [192, 160]], radiusPixels: 12 }, preview: false });
    const r = JSON.parse((screen as { _content: { text: string }[] })._content[0]!.text);
    expect(r.material.summary.texels).toBeGreaterThan(0);
    const painted = low(kit, model).pbr!.layers.find((l) => l.kind === 'paint')!;
    const coverage = (src: string): number => {
      const png = decodePng(file(kit, model, src));
      if (!png.ok) throw new Error(png.message);
      let n = 0;
      for (let i = 3; i < png.image.data.length; i += 4) if (png.image.data[i]! > 0) n += 1;
      return n;
    };
    const was = coverage(painted.maps!.albedo!.src);
    await kit.tools.model_paint_stroke({ ...t, part: lowId, brush: 'eraser', target: { mode: 'screen', view: 'front', points: [[192, 130], [192, 160]], radiusPixels: 12 }, preview: false });
    expect(coverage(low(kit, model).pbr!.layers.find((l) => l.kind === 'paint')!.maps!.albedo!.src)).toBeLessThan(was);

    // The mask of a fill layer is paintable, and gives it a painted mask.
    await kit.tools.model_paint_stroke({ ...t, part: lowId, layer: 'base', channel: 'mask', brush: 'fill', target: { mode: 'world', points: [[0, 0.45, 0.4]] }, preview: false });
    const base = low(kit, model).pbr!.layers.find((l) => l.id === 'base')!;
    expect(base.mask).toEqual({ source: 'painted' });
    expect(base.maps!.mask).toBeDefined();
  });
});
