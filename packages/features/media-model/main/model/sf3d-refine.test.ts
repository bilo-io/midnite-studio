// @vitest-environment node
import { MODEL_CLIP_PRESETS, ok, parseModelSidecar, type ModelGenerateProgressEvent, type ModelGenerateRequest } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearModelAssets } from '@midnite/studio-shared';
import { figureGlb } from './asset-fixture';
import type { CliRequest, IterativeHost, ScopedDispatch } from './iterative';
import { buildIterativePrompt } from './prompts';
import { memoryModelKit, type MemoryModelKit } from './model-test-kit';

/**
 * vitest/node: continuing an SF3D model with Claude (the `edit` request) and the auto-rig an SF3D run
 * finishes with. Runs on the synthetic textured `.glb` of `asset-fixture.ts` and a fake agent CLI that
 * calls the run's private dispatcher the way the MCP shim would.
 */
const fixture = figureGlb();
const STEM = 'figure-20261004-120000';
const DIR = `props/${STEM}`;
const sidecarOf = (kit: MemoryModelKit) => parseModelSidecar(kit.files.get(`${DIR}/${STEM}.json`)!.toString('utf8'))!;

beforeEach(() => clearModelAssets());

const importFigure = (kit: MemoryModelKit, rig: { anatomy?: 'biped' | 'static' | 'quadruped'; facing?: '+z' | '-z' } = {}) =>
  kit.service.importAsset({
    repoId: 'r1',
    project: 'props',
    stem: STEM,
    name: 'figure',
    prompt: 'Image to 3D: figure.png',
    engine: 'sf3d',
    glb: fixture.glb,
    reference: { file: `${STEM}.ref.png`, data: Buffer.from('SOURCE-PICTURE') },
    ...rig,
  });

describe('an SF3D import that is auto-rigged', () => {
  it('adds the rig and every preset clip of the anatomy, and keeps the asset part', async () => {
    const kit = memoryModelKit();
    const result = await importFigure(kit, { anatomy: 'biped' });
    expect(result.ok).toBe(true);
    const spec = sidecarOf(kit).spec;
    expect(spec.anatomy).toBe('biped');
    expect(spec.rig!.bones.map((b) => b.name)).toContain('hips');
    expect(spec.animations!.map((c) => c.kind)).toEqual([...MODEL_CLIP_PRESETS.biped]);
    expect(spec.parts).toHaveLength(1);
    expect(spec.parts[0]).toMatchObject({ shape: 'asset', src: `${STEM}.asset.glb` });
    expect(kit.files.get(`${DIR}/${STEM}.asset.glb`)!.equals(fixture.glb)).toBe(true);
    // The exports carry the skeleton too.
    expect(kit.files.get(`${DIR}/${STEM}.glb`)!.length).toBeGreaterThan(0);
  });

  it('leaves the model unrigged for static or no anatomy', async () => {
    for (const rig of [{}, { anatomy: 'static' as const }]) {
      const kit = memoryModelKit();
      await importFigure(kit, rig);
      const spec = sidecarOf(kit).spec;
      expect(spec.rig).toBeUndefined();
      expect(spec.animations).toBeUndefined();
    }
  });
});

describe('buildIterativePrompt with editing', () => {
  const target = { repoPath: '/r', project: 'props', model: 'a/a.obj' };
  it('says it is continuing an existing model and keeps asset parts, and not otherwise', () => {
    const editing = buildIterativePrompt({ prompt: 'longer arms', hasReference: true, target, maxIterations: 5, editing: true });
    expect(editing).toContain('CONTINUING');
    expect(editing).toContain('"shape": "asset"');
    expect(editing).toContain('model_get_reference_image');
    const fresh = buildIterativePrompt({ prompt: 'a fox', hasReference: false, target, maxIterations: 5 });
    expect(fresh).not.toContain('CONTINUING');
  });
});

describe('generate with an edit request (refine the selected model)', () => {
  const request = (overrides: Partial<ModelGenerateRequest> = {}): ModelGenerateRequest => ({
    generationId: 'g1',
    repoId: 'r1',
    project: 'props',
    prompt: 'give it a red hat',
    engine: { kind: 'agent', agentId: 'claude' },
    maxIterations: 3,
    edit: { path: `${STEM}/${STEM}.obj` },
    ...overrides,
  });

  async function setup(script: (ctx: { call: (tool: string, input?: Record<string, unknown>) => ReturnType<ScopedDispatch>; target: Record<string, string> }) => Promise<void>) {
    const events: ModelGenerateProgressEvent[] = [];
    const requests: CliRequest[] = [];
    let dispatch!: ScopedDispatch;
    const base = memoryModelKit();
    let tools = base.tools;
    const repoPath = base.repoPath;
    const target = { repoPath, project: 'props', model: `${STEM}/${STEM}.obj` };
    const host: IterativeHost = {
      startServer: async (req) => {
        dispatch = req.dispatch;
        return { ok: true, socketPath: '/tmp/r.sock', close: async () => undefined };
      },
      shimLaunch: () => ({ command: '/App/Midnite', args: ['/App/mcp-shim.js'], env: {} }),
      resolveAgent: async () => ({ id: 'claude', label: 'Claude Code', command: 'claude', baseArgs: [], headlessArgs: ['-p'] }),
      runCli: async (req) => {
        requests.push(req);
        req.onSpawned({ kill: () => undefined });
        await script({ call: (tool, input = {}) => dispatch(tool, { ...input }), target });
        return { ok: true, exitCode: 0, output: 'Added a hat.', stderr: '' };
      },
    };
    const kit = memoryModelKit({
      service: {
        emit: (event) => events.push(event),
        llm: vi.fn(async () => ok({ text: '{}' })),
        iterative: { host, tools: () => tools, repoPath: async () => repoPath, modelArgs: () => ['--model', 'opus'] },
      },
    });
    tools = kit.tools;
    const imported = await importFigure(kit);
    if (!imported.ok) throw new Error('import failed');
    return { kit, events, requests, target };
  }

  it('edits the existing model in place, hands the agent the source picture, and never touches the mesh', async () => {
    const { kit, events, requests } = await setup(async ({ call, target }) => {
      await call('model_get_spec', target);
      await call('model_patch_parts', { ...target, ops: [{ op: 'add', part: { name: 'hat', shape: 'cone', radius: 0.15, height: 0.2, position: [0, 1.9, 0], color: '#cc0000' } }] });
      await call('model_save', target);
    });
    const before = [...kit.files.keys()];
    const result = await kit.service.generate(request());
    expect(result).toMatchObject({ ok: true, value: { primary: `${STEM}/${STEM}.obj` } });

    // The same folder: no second model, no new files besides what the editor already wrote.
    expect([...kit.files.keys()].sort()).toEqual(before.sort());
    expect(kit.files.get(`${DIR}/${STEM}.asset.glb`)!.equals(fixture.glb)).toBe(true);
    expect(kit.files.get(`${DIR}/${STEM}.ref.png`)!.toString()).toBe('SOURCE-PICTURE');

    // The design gained the hat and still draws the textured mesh.
    const spec = sidecarOf(kit).spec;
    expect(spec.parts.map((p) => p.name)).toEqual(['mesh', 'hat']);
    expect(spec.parts[0]).toMatchObject({ shape: 'asset', src: `${STEM}.asset.glb` });

    // The brief says it is continuing a model that has a reference picture.
    const brief = requests[0]!.args.find((a) => a.includes('Request'))!;
    expect(brief).toContain('CONTINUING');
    expect(brief).toContain('model_get_reference_image');
    expect(brief).toContain('give it a red hat');
    expect(brief).toContain(JSON.stringify({ repoPath: '/work/repo', project: 'props', model: `${STEM}/${STEM}.obj` }));

    expect(events[0]).toMatchObject({ status: 'running', stage: 'iterating', primary: `${STEM}/${STEM}.obj` });
    expect(events.at(-1)).toMatchObject({ status: 'succeeded' });
  });

  it('serves the source picture through model_get_reference_image', async () => {
    let reference: unknown;
    const { kit } = await setup(async ({ call, target }) => {
      reference = await call('model_get_reference_image', target);
      await call('model_patch_parts', { ...target, ops: [{ op: 'update', id: 'p1', fields: { name: 'body' } }] });
    });
    await kit.service.generate(request());
    expect(JSON.stringify(reference)).toContain('image');
  });

  it('fails, and leaves the model alone, when the agent makes no edits (no one-shot rewrite)', async () => {
    const { kit, events } = await setup(async () => undefined);
    const before = sidecarOf(kit);
    const result = await kit.service.generate(request());
    expect(result.ok).toBe(false);
    expect(sidecarOf(kit)).toEqual(before);
    expect(events.at(-1)).toMatchObject({ status: 'failed' });
    expect(events.some((e) => e.stage === 'generating')).toBe(false);
  });

  it('refuses a model with no design, and a one-shot engine', async () => {
    const { kit } = await setup(async () => undefined);
    const missing = await kit.service.generate(request({ edit: { path: 'ghost/ghost.obj' } }));
    expect(missing).toMatchObject({ ok: false, message: expect.stringContaining('no design to refine') });
    const oneShot = await kit.service.generate(request({ engine: { kind: 'ollama', model: 'qwen' }, generationId: 'g2' }));
    expect(oneShot).toMatchObject({ ok: false, message: expect.stringContaining('iterate') });
  });
});

describe('the sf3d engine request', () => {
  it('forwards the anatomy and facing to the SF3D service', async () => {
    const generate = vi.fn(async () => ok({ files: ['m/m.obj'], primary: 'm/m.obj', vertices: 1, triangles: 1 }));
    const kit = memoryModelKit({ service: { sf3d: { generate, cancel: () => ok() } } });
    const result = await kit.service.generate({
      generationId: 'g9',
      repoId: 'r1',
      project: 'props',
      prompt: '',
      engine: { kind: 'sf3d', anatomy: 'biped', facing: '-z' },
      image: { name: 'a.png', mime: 'image/png', data: Buffer.from('x').toString('base64') },
    });
    expect(result.ok).toBe(true);
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ anatomy: 'biped', facing: '-z' }));
  });
});
