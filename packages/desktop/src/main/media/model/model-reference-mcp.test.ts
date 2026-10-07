import { buildScene, ModelSpecSchema, parseModelSidecar, rasterizeMask, referenceCamera } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { encodePngRgba8 } from '../png/png-codec';
import { reduceImage } from './reference-tools';
import { memoryModelKit } from './model-test-kit';

/** vitest: model_set_reference_views / model_compare_reference over the in-memory store (Phase 104 Theme H). */

vi.setConfig({ testTimeout: 30_000 });

type Kit = ReturnType<typeof memoryModelKit>;
const target = (kit: Kit, model: string) => ({ repoPath: kit.repoPath, project: 'gen', model });

const figure = (torso: number) => ({
  name: 'figure',
  parts: [
    { name: 'legs', shape: 'box', size: [0.4, 1, 0.4], position: [0, 0.5, 0] },
    { name: 'torso', shape: 'box', size: [torso, 1, 0.4], position: [0, 1.5, 0] },
    { name: 'head', shape: 'box', size: [0.5, 0.6, 0.4], position: [0, 2.3, 0] },
  ],
});

/** A uniform, opaque grey square: a picture with nothing in it. */
const flat = (side: number, grey: number): Uint8Array => {
  const data = new Uint8Array(side * side * 4).fill(grey);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return data;
};

type Content = { _content: { type: string; text?: string; data?: string }[] };
const json = (out: unknown) => JSON.parse((out as Content)._content[0]!.text!) as Record<string, any>;

/** A picture of the figure as a dark subject on a light ground, 100 px per metre, origin at the bottom centre. */
function picture(torso: number): Buffer {
  const spec = figure(torso);
  const parts = buildScene(ModelSpecSchema.parse(spec));
  const camera = referenceCamera({ view: 'front', scale: 100, offset: [150, 290] }, 300);
  const mask = rasterizeMask(parts, camera, 300, 300);
  const rgba = new Uint8Array(300 * 300 * 4);
  for (let i = 0; i < mask.data.length; i += 1) rgba.set(mask.data[i] ? [30, 30, 40, 255] : [238, 238, 238, 255], i * 4);
  return encodePngRgba8(rgba, 300, 300);
}

async function setup(kit: Kit, referenceTorso: number): Promise<string> {
  const made = await kit.tools.model_set_spec({ ...target(kit, 'figure'), spec: figure(1) });
  if (!made.ok) throw new Error(JSON.stringify(made.errors));
  const dir = made.model.split('/')[0]!;
  kit.files.set(`gen/${dir}/figure.ref.png`, picture(referenceTorso));
  const key = `gen/${made.model.replace('.obj', '.json')}`;
  const sidecar = parseModelSidecar(kit.files.get(key)!.toString('utf8'))!;
  kit.files.set(key, Buffer.from(JSON.stringify({ ...sidecar, reference: 'figure.ref.png' })));
  return made.model;
}

describe('model_set_reference_views', () => {
  it('fits a picture to a height and saves the matched view on the design', async () => {
    const kit = memoryModelKit();
    const model = await setup(kit, 1);
    const out = await kit.tools.model_set_reference_views({ ...target(kit, model), fit: { view: 'front', height: 2.6 } });
    if (!out.ok) throw new Error(JSON.stringify(out.errors));
    const [view] = out.referenceViews!;
    expect(view!.scale).toBeCloseTo(100, 0);
    expect(view!.offset[0]).toBeCloseTo(150, 0);
    expect(view!.offset[1]).toBeCloseTo(290, 0);
    const saved = parseModelSidecar(kit.files.get(`gen/${model.replace('.obj', '.json')}`)!.toString('utf8'))!;
    expect(saved.spec.referenceViews).toEqual(out.referenceViews);
  });

  it('takes a hand-written view, replaces one by name and clears', async () => {
    const kit = memoryModelKit();
    const model = await setup(kit, 1);
    await kit.tools.model_set_reference_views({ ...target(kit, model), views: [{ view: 'front', scale: 50, offset: [10, 20] }, { view: 'side', scale: 50, offset: [10, 20] }] });
    const fitted = await kit.tools.model_set_reference_views({ ...target(kit, model), fit: { view: 'front', height: 2.6 } });
    if (!fitted.ok) throw new Error('fit');
    expect(fitted.referenceViews!.map((v) => v.view).sort()).toEqual(['front', 'side']);
    const cleared = await kit.tools.model_set_reference_views({ ...target(kit, model), clear: true });
    if (!cleared.ok) throw new Error('clear');
    expect(cleared.referenceViews).toBeUndefined();
  });

  it('asks for something to do, and says when the picture has no subject', async () => {
    const kit = memoryModelKit();
    const model = await setup(kit, 1);
    const none = await kit.tools.model_set_reference_views(target(kit, model));
    expect(none.ok).toBe(false);
    const dir = model.split('/')[0]!;
    kit.files.set(`gen/${dir}/figure.ref.png`, encodePngRgba8(flat(16, 240), 16, 16));
    const blank = await kit.tools.model_set_reference_views({ ...target(kit, model), fit: { view: 'front', height: 2 } });
    expect(blank.ok).toBe(false);
  });

  it('refuses a fit with no picture', async () => {
    const kit = memoryModelKit();
    const made = await kit.tools.model_set_spec({ ...target(kit, 'bare'), spec: figure(1) });
    if (!made.ok) throw new Error('setup');
    await expect(kit.tools.model_set_reference_views({ ...target(kit, made.model), fit: { view: 'front', height: 2 } })).rejects.toMatchObject({ kind: 'not-found' });
  });
});

describe('model_compare_reference', () => {
  it('scores a model that matches its picture at 1 and draws an overlay', async () => {
    const kit = memoryModelKit();
    const model = await setup(kit, 1);
    await kit.tools.model_set_reference_views({ ...target(kit, model), fit: { view: 'front', height: 2.6 } });
    const out = await kit.tools.model_compare_reference({ ...target(kit, model), budget: 6 });
    const summary = json(out);
    expect(summary.score).toBeGreaterThan(0.97);
    expect(summary.views[0].regions).toEqual([]);
    expect(summary.loop).toMatchObject({ done: true, reason: 'target' });
    expect((out as Content)._content.some((c) => c.type === 'image')).toBe(true);
  });

  it('names the region that is too wide and tracks the score across passes', async () => {
    const kit = memoryModelKit();
    const model = await setup(kit, 0.6);
    await kit.tools.model_set_reference_views({ ...target(kit, model), fit: { view: 'front', height: 2.6 } });
    const first = json(await kit.tools.model_compare_reference({ ...target(kit, model), budget: 6, overlay: false }));
    expect(first.score).toBeLessThan(0.95);
    expect(first.views[0].regions[0]).toMatch(/too wide/);
    expect(first.loop).toMatchObject({ done: false, stage: 'block-in' });

    // Narrow the torso to the picture's width: the score rises.
    const patched = await kit.tools.model_patch_parts({ ...target(kit, model), ops: [{ op: 'update', id: 'p2', fields: { size: [0.6, 1, 0.4] } }] });
    expect(patched.ok).toBe(true);
    const second = json(await kit.tools.model_compare_reference({ ...target(kit, model), budget: 6, overlay: false }));
    expect(second.score).toBeGreaterThan(first.score);
    expect(second.history).toEqual([first.score, second.score]);
    expect(second.pass).toBe(1);

    const fresh = json(await kit.tools.model_compare_reference({ ...target(kit, model), reset: true, overlay: false }));
    expect(fresh.history).toHaveLength(1);
  });

  it('stops the loop on a plateau', async () => {
    const kit = memoryModelKit();
    const model = await setup(kit, 0.6);
    await kit.tools.model_set_reference_views({ ...target(kit, model), fit: { view: 'front', height: 2.6 } });
    let last: Record<string, any> = {};
    for (let i = 0; i < 4; i += 1) last = json(await kit.tools.model_compare_reference({ ...target(kit, model), budget: 9, overlay: false }));
    expect(last.loop).toMatchObject({ done: true, reason: 'plateau' });
  });

  it('refuses until a view is matched, and for a view that is not', async () => {
    const kit = memoryModelKit();
    const model = await setup(kit, 1);
    await expect(kit.tools.model_compare_reference(target(kit, model))).rejects.toMatchObject({ kind: 'refused' });
    await kit.tools.model_set_reference_views({ ...target(kit, model), fit: { view: 'front', height: 2.6 } });
    await expect(kit.tools.model_compare_reference({ ...target(kit, model), views: ['top'] })).rejects.toMatchObject({ kind: 'not-found' });
  });

  it('decodes a non-PNG picture through the injected decoder', async () => {
    const decode = vi.fn(async () => ({ width: 300, height: 300, data: flat(300, 200) }));
    const kit = memoryModelKit({ tools: { decodeImage: decode } });
    const model = await setup(kit, 1);
    const dir = model.split('/')[0]!;
    kit.files.set(`gen/${dir}/figure.ref.jpg`, Buffer.from('not a png'));
    const result = await kit.tools.model_set_reference_views({ ...target(kit, model), fit: { view: 'front', height: 2, image: 'figure.ref.jpg' } });
    expect(decode).toHaveBeenCalled();
    expect(result.ok).toBe(false); // a flat grey picture has no subject
  });
});

describe('reduceImage', () => {
  it('leaves a small picture alone and averages a big one by an integer factor', () => {
    const small = { width: 4, height: 4, data: new Uint8Array(64) };
    expect(reduceImage(small).factor).toBe(1);
    const big = { width: 8, height: 4, data: new Uint8Array(8 * 4 * 4).fill(100) };
    const out = reduceImage(big, 4);
    expect(out.factor).toBe(2);
    expect([out.image.width, out.image.height]).toEqual([4, 2]);
    expect(out.image.data[0]).toBe(100);
  });
});
