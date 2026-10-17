import { decodeMeshBin, isClosed, parseModelSidecar, parseOpsLog } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { memoryModelKit } from './model-test-kit';

/** vitest: model_sdf_set / model_sdf_patch / model_sdf_bake over the in-memory store (Phase 104 Theme C). */

vi.setConfig({ testTimeout: 30_000 });

type Kit = ReturnType<typeof memoryModelKit>;
const target = (kit: Kit, model: string) => ({ repoPath: kit.repoPath, project: 'gen', model });

const PLINTH = { name: 'bust', parts: [{ name: 'plinth', shape: 'box', size: [0.6, 0.1, 0.6], position: [0, -0.6, 0] }] };
const HEAD = {
  blend: 0.08,
  nodes: [
    { kind: 'sphere', name: 'cranium', radius: 0.35, color: '#e0b090' },
    { kind: 'capsule', name: 'neck', radius: 0.12, height: 0.25, position: [0, -0.4, 0] },
  ],
};

async function made(kit: Kit): Promise<string> {
  const out = await kit.tools.model_set_spec({ ...target(kit, 'bust'), spec: PLINTH });
  if (!out.ok) throw new Error(JSON.stringify(out.errors));
  return out.model;
}

const sidecarOf = (kit: Kit, model: string) => parseModelSidecar(kit.files.get(`gen/${model.replace(/\.obj$/, '.json')}`)!.toString('utf8'))!;

describe('model_sdf_*', () => {
  it('bakes a tree into a closed sculpt part whose op log opens with the tree', async () => {
    const kit = memoryModelKit();
    const model = await made(kit);
    const out = await kit.tools.model_sdf_set({ ...target(kit, model), tree: HEAD, name: 'head', resolution: 48 });
    if (!out.ok) throw new Error(JSON.stringify(out.errors));
    expect(out.sdf).toMatchObject({ id: 'p2', resolution: 48, nodes: ['cranium', 'neck'] });
    expect(out.sdf!.evaluatedShare).toBeLessThan(1);
    expect(out.parts.map((p) => p.shape)).toEqual(['box', 'sculpt']);

    const dir = model.split('/')[0]!;
    const key = `gen/${dir}/${out.sdf!.src}`;
    const bin = decodeMeshBin(new Uint8Array(kit.files.get(key)!));
    expect(isClosed({ positions: Array.from(bin.positions), indices: Array.from(bin.indices) })).toBe(true);
    const log = parseOpsLog(kit.files.get(key.replace('.mesh.bin', '.ops.jsonl'))!.toString('utf8'));
    expect(log.entries[0]).toMatchObject({ kind: 'sdf', by: 'agent', data: { resolution: 48, tree: { nodes: [{ name: 'cranium' }, { name: 'neck' }] } } });

    const part = sidecarOf(kit, model).spec.parts[1]!;
    expect(part).toMatchObject({ shape: 'sculpt', name: 'head', sdf: { resolution: 48 }, groups: [{ name: 'cranium', color: '#e0b090' }, { name: 'neck' }] });
    expect(kit.changed.at(-1)!.spec.parts).toHaveLength(2);
  });

  it('patches nodes by name and re-bakes in place, keeping the part', async () => {
    const kit = memoryModelKit();
    const model = await made(kit);
    const first = await kit.tools.model_sdf_set({ ...target(kit, model), tree: HEAD, resolution: 32 });
    if (!first.ok) throw new Error('setup');
    const patched = await kit.tools.model_sdf_patch({
      ...target(kit, model),
      ops: [
        { op: 'add', node: { kind: 'ellipsoid', name: 'nose', radii: [0.05, 0.08, 0.06], position: [0, 0, 0.34] } },
        { op: 'update', name: 'cranium', set: { radius: 0.38 } },
      ],
    });
    if (!patched.ok) throw new Error(JSON.stringify(patched.errors));
    expect(patched.sdf).toMatchObject({ id: first.sdf!.id, resolution: 32, nodes: ['cranium', 'neck', 'nose'] });
    expect(patched.sdf!.src).not.toBe(first.sdf!.src);
    expect(patched.parts).toHaveLength(2);

    const finer = await kit.tools.model_sdf_bake({ ...target(kit, model), part: first.sdf!.id, resolution: 80 });
    if (!finer.ok) throw new Error(JSON.stringify(finer.errors));
    expect(finer.sdf!.vertices).toBeGreaterThan(patched.sdf!.vertices);
    expect(sidecarOf(kit, model).spec.parts[1]).toMatchObject({ sdf: { resolution: 80, tree: { nodes: [{ name: 'cranium', radius: 0.38 }, { name: 'neck' }, { name: 'nose' }] } } });
  });

  it('answers a bad tree, a bad op or a non-SDF part as a validation result', async () => {
    const kit = memoryModelKit();
    const model = await made(kit);
    const badTree = await kit.tools.model_sdf_set({ ...target(kit, model), tree: { nodes: [{ kind: 'blob', name: 'x' }] } });
    expect(badTree).toMatchObject({ ok: false, errors: [{ path: expect.stringMatching(/^tree/) }] });
    const noPart = await kit.tools.model_sdf_patch({ ...target(kit, model), ops: [{ op: 'remove', name: 'x' }] });
    expect(noPart).toMatchObject({ ok: false, errors: [{ path: 'part' }] });
    const wrongPart = await kit.tools.model_sdf_bake({ ...target(kit, model), part: 'plinth', resolution: 64 });
    expect(wrongPart).toMatchObject({ ok: false, errors: [{ path: 'part', message: expect.stringContaining('box') }] });
    await kit.tools.model_sdf_set({ ...target(kit, model), tree: HEAD, resolution: 32 });
    const badOp = await kit.tools.model_sdf_patch({ ...target(kit, model), ops: [{ op: 'remove', name: 'ghost' }] });
    expect(badOp).toMatchObject({ ok: false, errors: [{ path: 'ops.0', message: expect.stringContaining('ghost') }] });
    const notAnOp = await kit.tools.model_sdf_patch({ ...target(kit, model), ops: [{ op: 'explode' }] });
    expect(notAnOp).toMatchObject({ ok: false, errors: [{ opIndex: 0 }] });
  });
});
