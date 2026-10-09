import { MCP_CONTENT_KEY, parseModelSidecar, RIG_EXAMPLE_BIPED, RIG_EXAMPLE_VEHICLE } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { McpToolError } from '../../mcp/errors';
import { memoryModelKit } from './model-test-kit';

/** vitest: the rig and animation model_* tools over the in-memory store. */

type Kit = ReturnType<typeof memoryModelKit>;
const target = (kit: Kit, model: string) => ({ repoPath: kit.repoPath, project: 'gen', model });

async function robot(kit: Kit, name = 'robot', spec: unknown = RIG_EXAMPLE_BIPED): Promise<string> {
  const result = await kit.tools.model_set_spec({ ...target(kit, name), spec: spec as Record<string, unknown> });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.model;
}

const specOf = (kit: Kit, model: string) => parseModelSidecar(kit.files.get(`gen/${model.replace(/\.obj$/, '.json')}`)!.toString('utf8'))!.spec;

describe('rig tools', () => {
  it('auto-rigs, reports the rig, patches it and announces each edit', async () => {
    const kit = memoryModelKit();
    const model = await robot(kit);
    const rigged = await kit.tools.model_auto_rig({ ...target(kit, model), anatomy: 'biped' });
    expect(rigged).toMatchObject({ ok: true, rig: { anatomy: 'biped', clips: [] } });
    expect(specOf(kit, model).rig!.bones.length).toBeGreaterThan(10);
    expect(kit.changed.at(-1)!.spec.anatomy).toBe('biped');

    const info = await kit.tools.model_get_rig(target(kit, model));
    expect(info.anatomy).toBe('biped');
    expect(info.bones.find((b) => b.name === 'hips')!.parent).toBe('root');
    expect(info.bindings.find((b) => b.part === 'left forearm')).toMatchObject({ bone: 'leftLowerArm', bound: false });
    expect(info.table.some((t) => t.name === 'leftUpperLeg' && t.required)).toBe(true);
    expect(info.clipKinds).toContain('walk');
    expect(info.issues).toEqual([]);

    const patched = await kit.tools.model_patch_rig({ ...target(kit, model), ops: [{ op: 'bind', part: 'left forearm', bone: 'leftHand' }, { op: 'falloff', value: 0 }] });
    expect(patched.ok).toBe(true);
    const after = await kit.tools.model_get_rig(target(kit, model));
    expect(after.bindings.find((b) => b.part === 'left forearm')).toMatchObject({ bone: 'leftHand', bound: true });
    expect(after.falloff).toBe(0);
  });

  it('answers structured errors and writes nothing for a bad rig edit', async () => {
    const kit = memoryModelKit();
    const model = await robot(kit);
    const before = kit.changed.length;
    const refused = await kit.tools.model_patch_rig({ ...target(kit, model), ops: [{ op: 'falloff', value: 0.4 }] });
    expect(refused.ok === false && refused.errors[0]!.path).toBe('anatomy');
    await kit.tools.model_auto_rig({ ...target(kit, model), anatomy: 'biped' });
    const bad = await kit.tools.model_patch_rig({ ...target(kit, model), ops: [{ op: 'setBone', name: 'leftWing', head: [0, 0, 0], tail: [0, 1, 0] }] });
    expect(bad.ok === false && bad.errors[0]).toMatchObject({ opIndex: 0, path: 'name' });
    expect(kit.changed.length).toBe(before + 1);
  });

  it('adds clips, renders a pose, and refuses a clip that does not exist', async () => {
    const kit = memoryModelKit();
    const model = await robot(kit);
    await kit.tools.model_auto_rig({ ...target(kit, model), anatomy: 'biped' });
    const added = await kit.tools.model_patch_animations({ ...target(kit, model), ops: [{ op: 'add', clip: { kind: 'walk' } }, { op: 'add', clip: { kind: 'jump', name: 'hop' } }] });
    expect(added).toMatchObject({ ok: true, rig: { clips: ['walk', 'hop'] } });
    const preview = await kit.tools.model_render_preview({ ...target(kit, model), views: ['front'], size: 128, pose: { clip: 'hop', time: 0.4 } });
    const blocks = preview[MCP_CONTENT_KEY] as { type: string; text?: string }[];
    expect(blocks[0]!.text).toContain('Posed: "hop" at 0.4s');
    expect(blocks.some((b) => b.type === 'image')).toBe(true);
    await expect(kit.tools.model_render_preview({ ...target(kit, model), pose: { clip: 'nope', time: 0 } })).rejects.toBeInstanceOf(McpToolError);
    const wrongKind = await kit.tools.model_patch_animations({ ...target(kit, model), ops: [{ op: 'add', clip: { kind: 'drive' } }] });
    expect(wrongKind.ok).toBe(false);
  });

  it('retargets clips from another model, skipping kinds the target cannot use', async () => {
    const kit = memoryModelKit();
    const source = await robot(kit, 'robot');
    await kit.tools.model_auto_rig({ ...target(kit, source), anatomy: 'biped' });
    await kit.tools.model_patch_animations({ ...target(kit, source), ops: [{ op: 'add', clip: { kind: 'walk' } }, { op: 'add', clip: { kind: 'custom', name: 'wave' } }] });
    const other = await robot(kit, 'twin');
    await kit.tools.model_auto_rig({ ...target(kit, other), anatomy: 'biped' });
    const copied = await kit.tools.model_retarget({ ...target(kit, other), from: { model: source } });
    expect(copied).toMatchObject({ ok: true, rig: { clips: ['walk', 'wave'] } });
    const car = await robot(kit, 'car', RIG_EXAMPLE_VEHICLE);
    await kit.tools.model_auto_rig({ ...target(kit, car), anatomy: 'vehicle' });
    const onCar = await kit.tools.model_retarget({ ...target(kit, car), from: { model: source } });
    expect(onCar).toMatchObject({ ok: true, skipped: ['walk'], rig: { clips: ['wave'] } });
  });

  it('static removes the rig and the clips again', async () => {
    const kit = memoryModelKit();
    const model = await robot(kit);
    await kit.tools.model_auto_rig({ ...target(kit, model), anatomy: 'biped' });
    await kit.tools.model_patch_animations({ ...target(kit, model), ops: [{ op: 'add', clip: { kind: 'idle' } }] });
    const flat = await kit.tools.model_auto_rig({ ...target(kit, model), anatomy: 'static' });
    expect(flat.ok && flat.rig).toBeUndefined();
    expect(specOf(kit, model).animations).toBeUndefined();
  });
});
