import { decodeMeshBin, isClosed, MCP_CONTENT_KEY, parseModelSidecar, parseOpsLog, type McpContentBlock } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { memoryModelKit } from './model-test-kit';

/** vitest: Phase 104 Theme E over the in-memory store — aimed strokes, masks, undo, subdivide, remesh, landmarks. */

vi.setConfig({ testTimeout: 60_000 });

type Kit = ReturnType<typeof memoryModelKit>;
const target = (kit: Kit, model: string) => ({ repoPath: kit.repoPath, project: 'gen', model });
const HEAD = { blend: 0.05, nodes: [{ kind: 'sphere', name: 'cranium', radius: 0.35, position: [0, 0.4, 0] }, { kind: 'capsule', name: 'neck', radius: 0.1, height: 0.3, position: [0, 0, 0] }] };

async function head(kit: Kit): Promise<string> {
  const made = await kit.tools.model_set_spec({ ...target(kit, 'bust'), spec: { name: 'bust', parts: [{ name: 'plinth', shape: 'box', size: [0.6, 0.05, 0.6], position: [0, -0.4, 0] }] } });
  if (!made.ok) throw new Error(JSON.stringify(made.errors));
  const sdf = await kit.tools.model_sdf_set({ ...target(kit, made.model), tree: HEAD, name: 'head', resolution: 48 });
  if (!sdf.ok) throw new Error(JSON.stringify(sdf.errors));
  return made.model;
}

const sidecar = (kit: Kit, model: string) => parseModelSidecar(kit.files.get(`gen/${model.replace(/\.obj$/, '.json')}`)!.toString('utf8'))!;
const headPart = (kit: Kit, model: string) => sidecar(kit, model).spec.parts.find((p) => p.name === 'head')! as Extract<ReturnType<typeof sidecar>['spec']['parts'][number], { shape: 'sculpt' }>;
const bin = (kit: Kit, model: string) => decodeMeshBin(new Uint8Array(kit.files.get(`gen/${model.split('/')[0]}/${headPart(kit, model).src}`)!));

function content(out: unknown): { json: Record<string, any>; blocks: McpContentBlock[] } {
  const blocks = (out as { [MCP_CONTENT_KEY]: McpContentBlock[] })[MCP_CONTENT_KEY];
  const first = blocks[0] as { text: string };
  return { json: JSON.parse(first.text), blocks };
}

describe('model_sculpt_stroke', () => {
  it('sculpts by preview pixels, returns a thumbnail and a summary, drops the SDF tree and logs the stroke', async () => {
    const kit = memoryModelKit();
    const model = await head(kit);
    await kit.tools.model_render_preview({ ...target(kit, model), views: ['front'], size: 256 });
    const before = bin(kit, model);
    const out = await kit.tools.model_sculpt_stroke({ ...target(kit, model), part: 'head', brush: 'inflate', radius: 0.12, strength: 1, target: { mode: 'screen', view: 'front', size: 256, points: [[128, 90]] } });
    const { json, blocks } = content(out);
    expect(json.ok).toBe(true);
    expect(json.sculpt.summary).toMatchObject({ brush: 'inflate' });
    expect(json.sculpt.summary.moved).toBeGreaterThan(0);
    expect(json.sculpt.summary.maxDisplacement).toBeGreaterThan(0);
    expect(json.sculpt).toMatchObject({ revision: 1, undoable: 1, redoable: 0 });
    expect(blocks.some((b) => b.type === 'image' && b.mimeType === 'image/png')).toBe(true);

    const part = headPart(kit, model);
    expect(part.sdf).toBeUndefined();
    expect(part.revision).toBe(1);
    const after = bin(kit, model);
    expect(after.positions.length).toBe(before.positions.length);
    expect(Array.from(after.positions)).not.toEqual(Array.from(before.positions));
    expect(isClosed({ positions: Array.from(after.positions), indices: Array.from(after.indices) })).toBe(true);
    const log = parseOpsLog(kit.files.get(`gen/${model.split('/')[0]}/${part.src.replace('.mesh.bin', '.ops.jsonl')}`)!.toString('utf8'));
    expect(log.entries.some((e) => e.kind === 'stroke' && e.by === 'agent')).toBe(true);
    expect(kit.changed.at(-1)!.spec.parts.find((p) => p.name === 'head')).toMatchObject({ revision: 1 });
  });

  it('returns validation results, not throws, for bad targets and parts', async () => {
    const kit = memoryModelKit();
    const model = await head(kit);
    const t = target(kit, model);
    const miss = await kit.tools.model_sculpt_stroke({ ...t, brush: 'draw', target: { mode: 'screen', view: 'front', points: [[2, 2]] } });
    expect(miss).toMatchObject({ ok: false, errors: [{ path: 'target.points' }] });
    const noRig = await kit.tools.model_sculpt_stroke({ ...t, brush: 'draw', target: { mode: 'region', bone: 'head' } });
    expect(noRig).toMatchObject({ ok: false, errors: [{ message: expect.stringContaining('model_auto_rig') }] });
    expect(await kit.tools.model_sculpt_stroke({ ...t, part: 'nope', brush: 'draw', target: { mode: 'world', points: [[0, 0, 0]] } })).toMatchObject({ ok: false, errors: [{ path: 'part' }] });
    expect(await kit.tools.model_sculpt_stroke({ ...t, brush: 'draw', target: { mode: 'region', landmark: 'elbow' } })).toMatchObject({ ok: false });
  });

  it('aims by landmark and by world path', async () => {
    const kit = memoryModelKit();
    const model = await head(kit);
    const landmarks = await kit.tools.model_get_landmarks(target(kit, model));
    expect(landmarks.landmarks.find((l) => l.name === 'top_of_head')).toBeDefined();
    const byLandmark = content(await kit.tools.model_sculpt_stroke({ ...target(kit, model), brush: 'clay', strength: 1, radius: 0.1, target: { mode: 'region', landmark: 'top_of_head' }, preview: false }));
    expect(byLandmark.json.sculpt.summary.moved).toBeGreaterThan(0);
    expect(byLandmark.blocks).toHaveLength(1);
    const byPath = content(await kit.tools.model_sculpt_stroke({ ...target(kit, model), brush: 'smooth', strength: 1, radius: 0.1, target: { mode: 'world', points: [[0.3, 0.4, 0.1], [0.3, 0.5, 0.1]] }, preview: false }));
    expect(byPath.json.ok).toBe(true);
  });

  it('mirrors a stroke across the enabled symmetry axis', async () => {
    const kit = memoryModelKit();
    const model = await head(kit);
    const before = bin(kit, model);
    await kit.tools.model_sculpt_stroke({ ...target(kit, model), brush: 'inflate', strength: 1, radius: 0.1, symmetry: { x: true }, target: { mode: 'world', points: [[0.3, 0.4, 0]] }, preview: false });
    const after = bin(kit, model);
    const moved = (side: number) => {
      let n = 0;
      for (let v = 0; v < before.positions.length; v += 3) if (Math.sign(before.positions[v]!) === side && [0, 1, 2].some((k) => after.positions[v + k] !== before.positions[v + k])) n += 1;
      return n;
    };
    expect(moved(1)).toBeGreaterThan(0);
    expect(moved(-1)).toBeGreaterThan(0);
  });
});

describe('model_mask, undo, subdivide, remesh', () => {
  it('a masked region is spared by the stroke, and the mask is one undo step', async () => {
    const kit = memoryModelKit();
    const model = await head(kit);
    const t = target(kit, model);
    const masked = await kit.tools.model_mask({ ...t, op: 'set', region: { landmark: 'top_of_head', radius: 0.2 } });
    if (!masked.ok) throw new Error(JSON.stringify(masked.errors));
    expect(masked.sculpt!.summary.masked).toBeGreaterThan(0);
    const stroke = content(await kit.tools.model_sculpt_stroke({ ...t, brush: 'inflate', strength: 1, radius: 0.1, target: { mode: 'region', landmark: 'top_of_head' }, preview: false }));
    expect(stroke.json.sculpt.summary.moved).toBe(0);
    expect(await kit.tools.model_mask({ ...t, op: 'clear' })).toMatchObject({ ok: true, sculpt: { summary: { masked: 0 } } });
    expect(await kit.tools.model_mask({ ...t, op: 'set' })).toMatchObject({ ok: false, errors: [{ path: 'op' }] });
  });

  it('undoes and redoes strokes back to byte-identical meshes', async () => {
    const kit = memoryModelKit();
    const model = await head(kit);
    const t = target(kit, model);
    const original = Array.from(bin(kit, model).positions);
    await kit.tools.model_sculpt_stroke({ ...t, brush: 'inflate', strength: 1, radius: 0.1, target: { mode: 'world', points: [[0.3, 0.4, 0]] }, preview: false });
    const stroked = Array.from(bin(kit, model).positions);
    expect(stroked).not.toEqual(original);
    const undone = content(await kit.tools.model_sculpt_undo(t));
    expect(undone.json.ok).toBe(true);
    expect(Array.from(bin(kit, model).positions)).toEqual(original);
    expect(undone.json.sculpt).toMatchObject({ undoable: 0, redoable: 1 });
    await kit.tools.model_sculpt_undo({ ...t, redo: true });
    expect(Array.from(bin(kit, model).positions)).toEqual(stroked);
    expect(await kit.tools.model_sculpt_undo({ ...t, steps: 9 })).toMatchObject({ ok: false, errors: [{ path: 'steps' }] });
  });

  it('subdivides to four times the faces and remeshes to a closed mesh', async () => {
    const kit = memoryModelKit();
    const model = await head(kit);
    const t = target(kit, model);
    const faces = headPart(kit, model).triangles!;
    const sub = await kit.tools.model_subdivide(t);
    if (!sub.ok) throw new Error(JSON.stringify(sub.errors));
    expect(sub.sculpt!.triangles).toBe(faces * 4);
    expect(sub.sculpt!.level).toBe(1);
    const re = await kit.tools.model_remesh({ ...t, targetVertices: 3000 });
    if (!re.ok) throw new Error(JSON.stringify(re.errors));
    const mesh = bin(kit, model);
    expect(isClosed({ positions: Array.from(mesh.positions), indices: Array.from(mesh.indices) })).toBe(true);
    expect(re.sculpt!.vertices).toBeGreaterThan(1500);
  });
});
