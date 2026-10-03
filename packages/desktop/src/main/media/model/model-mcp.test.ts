import { MCP_CONTENT_KEY, MCP_TOOLS, MODEL_MCP_TOOL_IDS, MODEL_MAX_PARTS, parseModelSidecar, type McpToolOutput } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { McpToolError } from '../../mcp/errors';
import { REFERENCE_IMAGE_RAW_LIMIT } from './model-mcp';
import { BOX_SPEC, memoryModelKit } from './model-test-kit';
import { pngSize } from './preview';

/** vitest: the model_* tools over an in-memory store — no disk, no Electron, no CLI. */

const target = (kit: { repoPath: string }, model: string) => ({ repoPath: kit.repoPath, project: 'gen', model });

/** Start a model through the tool a real agent uses and return its file. */
async function started(kit: ReturnType<typeof memoryModelKit>, spec: unknown = BOX_SPEC): Promise<string> {
  const result = await kit.tools.model_set_spec({ ...target(kit, 'crate'), spec: spec as Record<string, unknown> });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.model;
}

const sidecarOf = (kit: ReturnType<typeof memoryModelKit>, model: string) =>
  parseModelSidecar(kit.files.get(`gen/${model.replace(/\.obj$/, '.json')}`)!.toString('utf8'))!;

describe('tool registry', () => {
  it('registers every model tool with a zod input and the readOnly flag its kind calls for', () => {
    for (const id of MODEL_MCP_TOOL_IDS) expect(MCP_TOOLS[id].id).toBe(id);
    const writes = MODEL_MCP_TOOL_IDS.filter((id) => !MCP_TOOLS[id].readOnly);
    expect(writes.sort()).toEqual(['model_open', 'model_patch_parts', 'model_save', 'model_set_spec']);
  });
});

describe('model_set_spec', () => {
  it('starts a new model from a bare name: writes the trio, answers with the file and the part ids, and announces it', async () => {
    const kit = memoryModelKit();
    const result = await kit.tools.model_set_spec({ ...target(kit, 'crate'), spec: BOX_SPEC });
    expect(result).toMatchObject({ ok: true, model: 'crate-20261003-141502.obj', partCount: 1, parts: [{ id: 'p1', name: 'crate', shape: 'box' }] });
    expect([...kit.files.keys()].sort()).toEqual(
      ['gen/crate-20261003-141502.fbx', 'gen/crate-20261003-141502.json', 'gen/crate-20261003-141502.mtl', 'gen/crate-20261003-141502.obj'].sort(),
    );
    expect(kit.changed).toHaveLength(1);
    expect(kit.changed[0]).toMatchObject({ project: 'gen', path: 'crate-20261003-141502.obj', saved: true });
  });

  it('replaces the design of an existing model, writing only the sidecar until it is saved', async () => {
    const kit = memoryModelKit();
    const model = await started(kit);
    const objBefore = kit.files.get('gen/crate-20261003-141502.obj')!;
    const next = { ...BOX_SPEC, parts: [...BOX_SPEC.parts, { name: 'lid', shape: 'box', size: [1, 0.1, 1], position: [0, 1.05, 0] }] };
    const result = await kit.tools.model_set_spec({ ...target(kit, model), spec: next });
    expect(result).toMatchObject({ ok: true, partCount: 2, revision: 2 });
    expect(sidecarOf(kit, model).spec.parts).toHaveLength(2);
    expect(kit.files.get('gen/crate-20261003-141502.obj')).toBe(objBefore);
    expect(kit.changed.at(-1)).toMatchObject({ saved: false, revision: 2 });
    expect(kit.changed.at(-1)!.spec.parts).toHaveLength(2);
  });

  it('answers a structured error, changes nothing and throws nothing for an invalid design', async () => {
    const kit = memoryModelKit();
    const result = await kit.tools.model_set_spec({ ...target(kit, 'crate'), spec: { parts: [{ shape: 'box' }] } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatchObject({ path: 'parts.0.size' });
    expect(kit.files.size).toBe(0);
    expect(kit.changed).toHaveLength(0);
  });

  it('refuses a repository the app has not opened, and a named model that does not exist', async () => {
    const kit = memoryModelKit();
    await expect(kit.tools.model_set_spec({ repoPath: '/elsewhere', project: 'gen', model: 'x', spec: BOX_SPEC })).rejects.toMatchObject({ kind: 'refused' });
    await expect(kit.tools.model_set_spec({ ...target(kit, 'ghost.obj'), spec: BOX_SPEC })).rejects.toBeInstanceOf(McpToolError);
  });
});

describe('model_patch_parts', () => {
  it('patches by id, reports the new bounds, persists the sidecar and announces the new design', async () => {
    const kit = memoryModelKit();
    const model = await started(kit);
    const result = await kit.tools.model_patch_parts({
      ...target(kit, model),
      ops: [
        { op: 'update', id: 'p1', fields: { color: '#00aa00' } },
        { op: 'add', part: { name: 'ball', shape: 'sphere', radius: 0.25, position: [0, 1.25, 0] } },
      ],
    });
    expect(result).toMatchObject({ ok: true, partCount: 2, revision: 2 });
    if (!result.ok) return;
    expect(result.bounds.max[1]).toBeCloseTo(1.5, 2);
    expect(sidecarOf(kit, model).spec.parts.map((p) => [p.name, p.color])).toEqual([
      ['crate', '#00aa00'],
      ['ball', '#b0b0b0'],
    ]);
    expect(kit.changed.at(-1)!.spec.parts).toHaveLength(2);
  });

  it('is all-or-nothing: a rejected op returns its errors and leaves design, files and events alone', async () => {
    const kit = memoryModelKit();
    const model = await started(kit);
    const events = kit.changed.length;
    const result = await kit.tools.model_patch_parts({
      ...target(kit, model),
      ops: [
        { op: 'update', id: 'p1', fields: { color: '#ffffff' } },
        { op: 'remove', id: 'nope' },
      ],
    });
    expect(result).toMatchObject({ ok: false, errors: [{ opIndex: 1, path: 'id' }] });
    expect(sidecarOf(kit, model).spec.parts[0]!.color).toBe('#cc3333');
    expect(kit.changed).toHaveLength(events);
  });

  it('enforces the single part cap', async () => {
    const kit = memoryModelKit();
    const model = await started(kit);
    const batch = (n: number) => Array.from({ length: n }, (_, i) => ({ op: 'add' as const, part: { name: `n${i}`, shape: 'sphere', radius: 0.1 } }));
    // The model starts with one placeholder part; fill to the cap in ≤ 60-op calls, then one more call overshoots.
    const fills: boolean[] = [];
    let have = 1;
    while (have + 60 <= MODEL_MAX_PARTS) {
      fills.push((await kit.tools.model_patch_parts({ ...target(kit, model), ops: batch(60) })).ok);
      have += 60;
    }
    const rest = MODEL_MAX_PARTS - have;
    const topUp = await kit.tools.model_patch_parts({ ...target(kit, model), ops: batch(rest) });
    const over = await kit.tools.model_patch_parts({ ...target(kit, model), ops: batch(1) });
    expect([...fills, topUp.ok, over.ok]).toEqual([...fills.map(() => true), true, false]);
  });

  it('serialises parallel calls: each patch sees the design the previous one left', async () => {
    const kit = memoryModelKit();
    const model = await started(kit);
    const adds = Array.from({ length: 6 }, (_, i) =>
      kit.tools.model_patch_parts({ ...target(kit, model), ops: [{ op: 'add', part: { name: `part ${i}`, shape: 'sphere', radius: 0.1 } }] }),
    );
    const results = await Promise.all(adds);
    expect(results.every((r) => r.ok)).toBe(true);
    const spec = sidecarOf(kit, model).spec;
    expect(spec.parts).toHaveLength(7);
    expect(new Set(spec.parts.map((p) => p.id)).size).toBe(7);
  });
});

describe('model_get_spec', () => {
  it('returns the design with ids plus the schema, the reference and the limits, so the format is learned from the tool', async () => {
    const kit = memoryModelKit();
    const model = await started(kit);
    const got = await kit.tools.model_get_spec(target(kit, model));
    expect(got.spec).toMatchObject({ name: 'crate', parts: [{ id: 'p1', shape: 'box' }] });
    expect(got.limits).toEqual({ maxParts: MODEL_MAX_PARTS });
    expect(got.reference).toContain('"lathe"');
    expect(JSON.stringify(got.schema)).toContain('radiusTop');
  });

  it('answers not-found, naming how to start one, for a model with no design', async () => {
    const kit = memoryModelKit();
    await expect(kit.tools.model_get_spec(target(kit, 'ghost.obj'))).rejects.toMatchObject({ kind: 'not-found', message: expect.stringContaining('model_set_spec') });
  });
});

describe('model_render_preview', () => {
  it('returns text plus one PNG image block per requested view', async () => {
    const kit = memoryModelKit();
    const model = await started(kit);
    const out = (await kit.tools.model_render_preview({ ...target(kit, model), views: ['front', 'iso'], size: 160 })) as McpToolOutput<'model_render_preview'>;
    const blocks = out[MCP_CONTENT_KEY] as { type: string; data?: string; mimeType?: string; text?: string }[];
    expect(blocks.map((b) => b.type)).toEqual(['text', 'text', 'image', 'text', 'image']);
    expect(blocks[0]!.text).toContain('1 parts');
    const images = blocks.filter((b) => b.type === 'image');
    for (const image of images) {
      expect(image.mimeType).toBe('image/png');
      expect(pngSize(Buffer.from(image.data!, 'base64'))).toEqual({ width: 160, height: 160 });
    }
  });

  it('shows the edit that was just made — the render is of the live design, not a cached one', async () => {
    const kit = memoryModelKit();
    const model = await started(kit);
    const render = async () => ((await kit.tools.model_render_preview({ ...target(kit, model), views: ['front'], size: 128 })) as { _content: { data?: string }[] })._content[2]!.data;
    const before = await render();
    await kit.tools.model_patch_parts({ ...target(kit, model), ops: [{ op: 'update', id: 'p1', fields: { color: '#0000ff' } }] });
    expect(await render()).not.toBe(before);
  });
});

describe('model_get_reference_image', () => {
  it('serves the attached picture as image content', async () => {
    const kit = memoryModelKit();
    const model = await started(kit);
    const sidecar = sidecarOf(kit, model);
    kit.files.set('gen/crate.ref.png', Buffer.from('PNGBYTES'));
    kit.files.set(`gen/${model.replace('.obj', '.json')}`, Buffer.from(JSON.stringify({ ...sidecar, reference: 'crate.ref.png' })));
    const out = (await kit.tools.model_get_reference_image(target(kit, model))) as { _content: { type: string; data?: string; mimeType?: string }[] };
    expect(out._content[1]).toEqual({ type: 'image', data: Buffer.from('PNGBYTES').toString('base64'), mimeType: 'image/png' });
  });

  it('answers not-found when no picture is attached, and shrinks one that is too large for a response', async () => {
    const shrink = vi.fn(async () => ({ data: Buffer.from('small'), mime: 'image/jpeg' }));
    const kit = memoryModelKit({ tools: { shrinkImage: shrink } });
    const model = await started(kit);
    await expect(kit.tools.model_get_reference_image(target(kit, model))).rejects.toMatchObject({ kind: 'not-found' });
    kit.files.set('gen/big.ref.jpg', Buffer.alloc(REFERENCE_IMAGE_RAW_LIMIT + 1));
    kit.files.set(`gen/${model.replace('.obj', '.json')}`, Buffer.from(JSON.stringify({ ...sidecarOf(kit, model), reference: 'big.ref.jpg' })));
    const out = (await kit.tools.model_get_reference_image(target(kit, model))) as { _content: { type: string; mimeType?: string }[] };
    expect(shrink).toHaveBeenCalledOnce();
    expect(out._content[1]).toMatchObject({ mimeType: 'image/jpeg' });
  });
});

describe('model_save, model_list and model_open', () => {
  it('model_save rewrites the whole trio from the design and announces the editor as saved', async () => {
    const kit = memoryModelKit();
    const model = await started(kit);
    await kit.tools.model_patch_parts({ ...target(kit, model), ops: [{ op: 'add', part: { name: 'ball', shape: 'sphere', radius: 0.3 } }] });
    expect(kit.files.get('gen/crate-20261003-141502.obj')!.toString()).not.toContain('ball');
    const saved = await kit.tools.model_save(target(kit, model));
    expect(saved).toEqual({ saved: true, files: ['crate-20261003-141502.json', 'crate-20261003-141502.mtl', 'crate-20261003-141502.obj', 'crate-20261003-141502.fbx'] });
    expect(kit.files.get('gen/crate-20261003-141502.obj')!.toString()).toContain('ball');
    expect(kit.changed.at(-1)).toMatchObject({ saved: true });
  });

  it('model_list lists projects and models with their part counts', async () => {
    const kit = memoryModelKit();
    await started(kit);
    const listed = await kit.tools.model_list({ repoPath: kit.repoPath });
    expect(listed.projects).toEqual([{ name: 'gen', models: [{ model: 'crate-20261003-141502.obj', name: 'crate', parts: 1, mtimeMs: 1 }] }]);
    expect((await kit.tools.model_list({ repoPath: kit.repoPath, project: 'other' })).projects).toEqual([]);
  });

  it('model_open asks the window to show the model', async () => {
    const kit = memoryModelKit();
    const model = await started(kit);
    expect(await kit.tools.model_open(target(kit, model))).toEqual({ opened: true, model });
    expect(kit.opened).toEqual([{ repoId: 'r1', project: 'gen', path: model }]);
  });
});
